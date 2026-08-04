import Blob "mo:core/Blob";
import Error "mo:core/Error";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Nat64 "mo:core/Nat64";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Time "mo:core/Time";

import Call "mo:ic/Call";
import IC "mo:ic/Types";

import OracleMixin "mixins/Oracle";
import Types "types";

actor Oracle {
  type MarketData = {
    movers : Text;
    promo : Text;
  };

  type MarketPayload = MarketData and {
    stale : Bool;
  };

  type MarketResult = {
    #ok : MarketPayload;
    #err : Text;
  };

  type MarketCache = MarketData and {
    fetchedAt : Int;
  };

  let marketCacheTtlNanos = 5 * 60 * 1_000_000_000;
  let receipts = Map.empty<Nat64, Types.Receipt>();
  var marketCache : ?MarketCache = null;
  transient var marketRequestInFlight = false;

  include OracleMixin(receipts, Principal.fromActor(Oracle));

  func marketPayload(cache : MarketCache) : MarketPayload {
    {
      movers = cache.movers;
      promo = cache.promo;
      stale = Time.now() - cache.fetchedAt >= marketCacheTtlNanos;
    };
  };

  func cachedMarketOrError(message : Text) : MarketResult {
    switch (marketCache) {
      case (?cache) { #ok(marketPayload(cache)) };
      case null { #err(message) };
    };
  };

  public query func getCachedMarketMovers() : async MarketResult {
    cachedMarketOrError("ICP Tokens data has not been loaded yet");
  };

  public query func transformMarketResponse(args : {
    context : Blob;
    response : IC.HttpRequestResult;
  }) : async IC.HttpRequestResult {
    { args.response with headers = [] };
  };

  func fetchJson(url : Text, maxResponseBytes : Nat64) : async Text {
    let response = await Call.httpRequest({
      url;
      max_response_bytes = ?maxResponseBytes;
      headers = [
        { name = "Accept"; value = "application/json" },
        { name = "Host"; value = "icptokens.net" },
        { name = "User-Agent"; value = "NAK-ICP-canister" },
      ];
      body = null;
      method = #get;
      transform = ?{
        function = transformMarketResponse;
        context = Blob.empty();
      };
      // Market bubbles are decorative. A single outcall avoids multiplying
      // ICP Tokens requests across subnet replicas and its free rate limit.
      is_replicated = ?false;
    });

    if (response.status != 200) {
      throw Error.reject("ICP Tokens returned HTTP " # response.status.toText());
    };

    switch (response.body.decodeUtf8()) {
      case (?body) { body };
      case null { throw Error.reject("ICP Tokens returned invalid UTF-8") };
    };
  };

  public func getMarketMovers() : async MarketResult {
    let now = Time.now();
    switch (marketCache) {
      case (?cache) {
        if (now - cache.fetchedAt < marketCacheTtlNanos) {
          return #ok(marketPayload(cache));
        };
      };
      case null {};
    };

    if (marketRequestInFlight) {
      return cachedMarketOrError("ICP Tokens refresh is already in progress");
    };

    marketRequestInFlight := true;
    try {
      let movers = await fetchJson(
        "https://icptokens.net/api/v2/gainers-losers?limit=4",
        12_000,
      );
      let promo = await fetchJson(
        "https://icptokens.net/api/tokens/eig2s-waaaa-aaaam-qbg5a-cai",
        24_000,
      );
      let fetchedAt = Time.now();
      marketCache := ?{ movers; promo; fetchedAt };
      marketRequestInFlight := false;
      #ok({ movers; promo; stale = false });
    } catch (error) {
      marketRequestInFlight := false;
      cachedMarketOrError("ICP Tokens request failed: " # error.message());
    };
  };
};
