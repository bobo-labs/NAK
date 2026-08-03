import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";

import Types "../types";

module {
  let amount : Nat64 = 1_000_000;
  let fee : Nat64 = 10_000;
  let decimals : Nat8 = 8;

  func required<system>(name : Text) : { #ok : Text; #err : Text } {
    switch (Runtime.envVar<system>(name)) {
      case (?value) { #ok(value) };
      case null { #err("Missing canister environment variable: " # name) };
    };
  };

  public func load<system>() : Types.ConfigResult {
    switch (required<system>("NAK_NETWORK")) {
      case (#err(message)) { #err(message) };
      case (#ok(network)) {
        switch (required<system>("NAK_LEDGER_CANISTER_ID")) {
          case (#err(message)) { #err(message) };
          case (#ok(ledgerId)) {
            switch (required<system>("NAK_INDEX_CANISTER_ID")) {
              case (#err(message)) { #err(message) };
              case (#ok(indexId)) {
                switch (required<system>("NAK_TOKEN_SYMBOL")) {
                  case (#err(message)) { #err(message) };
                  case (#ok(tokenSymbol)) {
                    #ok({
                      network;
                      ledgerCanisterId = Principal.fromText(ledgerId);
                      indexCanisterId = Principal.fromText(indexId);
                      tokenSymbol;
                      amount;
                      fee;
                      decimals;
                    });
                  };
                };
              };
            };
          };
        };
      };
    };
  };
};
