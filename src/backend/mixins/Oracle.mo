import Blob "mo:core/Blob";
import Error "mo:core/Error";
import Map "mo:core/Map";
import Nat64 "mo:core/Nat64";
import Principal "mo:core/Principal";
import Random "mo:core/Random";

import Types "../types";
import Answer "../lib/Answer";
import Config "../lib/Config";
import Ledger "../lib/Ledger";
import Payment "../lib/Payment";

mixin (
  receipts : Map.Map<Nat64, Types.Receipt>,
  oraclePrincipal : Principal,
) {
  type PaymentEvidence = {
    #direct : Ledger.CandidBlock;
    #indexed : Ledger.TransactionWithId;
  };

  func sameClaim(receipt : Types.Receipt, request : Types.SettleRequest) : Bool {
    Blob.equal(receipt.paymentId, request.paymentId) and
    Blob.equal(receipt.questionCommitment, request.questionCommitment) and
    receipt.legacyMemo == request.legacyMemo;
  };

  func answerReceipt(receipt : Types.Receipt, answerId : Nat8) : Types.AnswerReceipt {
    {
      blockIndex = receipt.blockIndex;
      answerId;
      tokenSymbol = receipt.tokenSymbol;
      amount = receipt.amount;
    };
  };

  func view(receipt : Types.Receipt) : Types.ReceiptView {
    {
      blockIndex = receipt.blockIndex;
      paymentId = receipt.paymentId;
      questionCommitment = receipt.questionCommitment;
      tokenSymbol = receipt.tokenSymbol;
      amount = receipt.amount;
      state = receipt.state;
    };
  };

  func answerVerified(receipt : Types.Receipt) : async Types.SettleResult {
    let answering = { receipt with state = #answering };
    receipts.add(receipt.blockIndex, answering);

    try {
      let entropy = await Random.blob();
      let answerId = Answer.fromEntropy(entropy);
      let complete = { receipt with state = #complete(answerId) };
      receipts.add(receipt.blockIndex, complete);
      #ok(answerReceipt(complete, answerId));
    } catch (error) {
      receipts.add(receipt.blockIndex, { receipt with state = #verified });
      #err(#upstream("Randomness unavailable: " # error.message()));
    };
  };

  public query func health() : async Text {
    "ok";
  };

  public func getConfig() : async Types.ConfigResult {
    Config.load<system>();
  };

  public query func getReceipt(blockIndex : Nat64) : async ?Types.ReceiptView {
    switch (receipts.get(blockIndex)) {
      case (?receipt) { ?view(receipt) };
      case null { null };
    };
  };

  public shared func settlePayment(request : Types.SettleRequest) : async Types.SettleResult {
    switch (Payment.validateRequest(request)) {
      case (?error) { return #err(error) };
      case null {};
    };

    switch (receipts.get(request.blockIndex)) {
      case (?receipt) {
        if (not sameClaim(receipt, request)) {
          return #err(#blockAlreadyClaimed);
        };
        switch (receipt.state) {
          case (#complete(answerId)) { return #ok(answerReceipt(receipt, answerId)) };
          case (#answering) { return #err(#busy) };
          case (#verified) { return await answerVerified(receipt) };
        };
      };
      case null {};
    };

    let config = switch (Config.load<system>()) {
      case (#ok(value)) { value };
      case (#err(message)) { return #err(#configuration(message)) };
    };

    let account = {
      owner = oraclePrincipal;
      subaccount = ?request.paymentId;
    };

    let ledger = Ledger.ledger(config.ledgerCanisterId);
    let expectedAccountIdentifier = try {
      await ledger.account_identifier(account);
    } catch (error) {
      return #err(#upstream("Ledger lookup failed: " # error.message()));
    };

    var evidence : ?PaymentEvidence = try {
      let response = await ledger.query_blocks({
        start = request.blockIndex;
        length = 1;
      });
      switch (Ledger.findLedgerBlock(response, request.blockIndex)) {
        case (?block) { ?#direct(block) };
        case null { null };
      };
    } catch (_) {
      null;
    };

    if (evidence == null) {
      let response = try {
        await Ledger.index(config.indexCanisterId).get_account_transactions({
          account;
          start = null;
          max_results = 5;
        });
      } catch (error) {
        return #err(#upstream("Index lookup failed: " # error.message()));
      };

      let transactions = switch (response) {
        case (#Ok(value)) { value.transactions };
        case (#Err(error)) { return #err(#upstream("Index error: " # error.message)) };
      };

      evidence := switch (Payment.findTransaction(transactions, request.blockIndex)) {
        case (?entry) { ?#indexed(entry) };
        case null { return #err(#paymentNotIndexed) };
      };
    };

    // Inter-canister calls above are re-entrancy points. Re-check before journaling.
    switch (receipts.get(request.blockIndex)) {
      case (?receipt) {
        if (not sameClaim(receipt, request)) {
          return #err(#blockAlreadyClaimed);
        };
        switch (receipt.state) {
          case (#complete(answerId)) { return #ok(answerReceipt(receipt, answerId)) };
          case (#answering) { return #err(#busy) };
          case (#verified) { return await answerVerified(receipt) };
        };
      };
      case null {};
    };

    let paymentError = switch (evidence) {
      case (?#direct(block)) {
        Payment.verifyLedgerBlock(request, config, expectedAccountIdentifier, block);
      };
      case (?#indexed(entry)) {
        Payment.verifyTransaction(
          request,
          config,
          Ledger.accountIdentifierText(expectedAccountIdentifier),
          entry,
        );
      };
      case null { ?#paymentNotIndexed };
    };

    switch (paymentError) {
      case (?error) { return #err(error) };
      case null {};
    };

    let receipt : Types.Receipt = {
      blockIndex = request.blockIndex;
      paymentId = request.paymentId;
      questionCommitment = request.questionCommitment;
      legacyMemo = request.legacyMemo;
      tokenSymbol = config.tokenSymbol;
      amount = config.amount;
      state = #verified;
    };
    receipts.add(request.blockIndex, receipt);
    await answerVerified(receipt);
  };
};
