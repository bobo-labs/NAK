import Blob "mo:core/Blob";
import Text "mo:core/Text";

import Ledger "Ledger";
import Types "../types";

module {
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
        if (not transfer.to.equal(expectedAccountIdentifier)) {
          return ?#recipientMismatch;
        };
        if (transfer.amount.e8s != config.amount) {
          return ?#amountMismatch({
            expected = config.amount;
            received = transfer.amount.e8s;
          });
        };

        let memoMatches = switch (entry.transaction.icrc1_memo) {
          case (?memo) { Blob.equal(memo, request.questionCommitment) };
          case null { entry.transaction.memo == request.legacyMemo };
        };
        if (not memoMatches) {
          return ?#memoMismatch;
        };
        null;
      };
      case (_) { ?#recipientMismatch };
    };
  };
};
