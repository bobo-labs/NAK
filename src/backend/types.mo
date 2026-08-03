import Principal "mo:core/Principal";

module {
  public type TokenConfig = {
    network : Text;
    ledgerCanisterId : Principal;
    indexCanisterId : Principal;
    tokenSymbol : Text;
    amount : Nat64;
    fee : Nat64;
    decimals : Nat8;
  };

  public type SettleRequest = {
    blockIndex : Nat64;
    paymentId : Blob;
    questionCommitment : Blob;
    legacyMemo : Nat64;
  };

  public type AnswerReceipt = {
    blockIndex : Nat64;
    answerId : Nat8;
    tokenSymbol : Text;
    amount : Nat64;
  };

  public type SettleError = {
    #invalidInput : Text;
    #configuration : Text;
    #paymentNotIndexed;
    #blockAlreadyClaimed;
    #recipientMismatch;
    #amountMismatch : { expected : Nat64; received : Nat64 };
    #memoMismatch;
    #busy;
    #upstream : Text;
  };

  public type SettleResult = {
    #ok : AnswerReceipt;
    #err : SettleError;
  };

  public type ConfigResult = {
    #ok : TokenConfig;
    #err : Text;
  };

  public type ReceiptState = {
    #verified;
    #answering;
    #complete : Nat8;
  };

  public type Receipt = {
    blockIndex : Nat64;
    paymentId : Blob;
    questionCommitment : Blob;
    legacyMemo : Nat64;
    tokenSymbol : Text;
    amount : Nat64;
    state : ReceiptState;
  };

  public type ReceiptView = {
    blockIndex : Nat64;
    paymentId : Blob;
    questionCommitment : Blob;
    tokenSymbol : Text;
    amount : Nat64;
    state : ReceiptState;
  };
};
