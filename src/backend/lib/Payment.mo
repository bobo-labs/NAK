import Blob "mo:core/Blob";
import Text "mo:core/Text";

import Ledger "Ledger";
import Types "../types";

module {
  func verifyTransferFields(
    request : Types.SettleRequest,
    config : Types.TokenConfig,
    recipientMatches : Bool,
    amount : Nat64,
    icrc1Memo : ?Blob,
    legacyMemo : Nat64,
  ) : ?Types.SettleError {
    if (not recipientMatches) {
      return ?#recipientMismatch;
    };
    if (amount != config.amount) {
      return ?#amountMismatch({
        expected = config.amount;
        received = amount;
      });
    };

    let memoMatches = switch (icrc1Memo) {
      case (?memo) { Blob.equal(memo, request.questionCommitment) };
      case null { legacyMemo == request.legacyMemo };
    };
    if (not memoMatches) {
      return ?#memoMismatch;
    };
    null;
  };

  public func validateRequest(request : Types.SettleRequest) : ?Types.SettleError {
    if (request.paymentId.size() != 32) {
      ?#invalidInput("paymentId must be exactly 32 bytes")
    } else if (request.questionCommitment.size() != 32) {
      ?#invalidInput("questionCommitment must be exactly 32 bytes")
    } else {
      null
    };
  };

  public func findTransaction(
    transactions : [Ledger.TransactionWithId],
    blockIndex : Nat64,
  ) : ?Ledger.TransactionWithId {
    for (entry in transactions.values()) {
      if (entry.id == blockIndex) {
        return ?entry;
      };
    };
    null;
  };

  public func verifyTransaction(
    request : Types.SettleRequest,
    config : Types.TokenConfig,
    expectedAccountIdentifier : Text,
    entry : Ledger.TransactionWithId,
  ) : ?Types.SettleError {
    switch (entry.transaction.operation) {
      case (#Transfer(transfer)) {
        verifyTransferFields(
          request,
          config,
          transfer.to.equal(expectedAccountIdentifier),
          transfer.amount.e8s,
          entry.transaction.icrc1_memo,
          entry.transaction.memo,
        );
      };
      case (_) { ?#recipientMismatch };
    };
  };

  public func verifyLedgerBlock(
    request : Types.SettleRequest,
    config : Types.TokenConfig,
    expectedAccountIdentifier : Blob,
    block : Ledger.CandidBlock,
  ) : ?Types.SettleError {
    switch (block.transaction.operation) {
      case (?#Transfer(transfer)) {
        verifyTransferFields(
          request,
          config,
          Blob.equal(transfer.to, expectedAccountIdentifier),
          transfer.amount.e8s,
          block.transaction.icrc1_memo,
          block.transaction.memo,
        );
      };
      case (_) { ?#recipientMismatch };
    };
  };
};
