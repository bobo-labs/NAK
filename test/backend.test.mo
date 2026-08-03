import Principal "mo:core/Principal";

import Answer "../src/backend/lib/Answer";
import Ledger "../src/backend/lib/Ledger";
import Payment "../src/backend/lib/Payment";
import Types "../src/backend/types";

let paymentId : Blob = "\02\02\02\02\02\02\02\02\02\02\02\02\02\02\02\02\02\02\02\02\02\02\02\02\02\02\02\02\02\02\02\02";
let commitment : Blob = "\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01";

assert Answer.fromRoll(0) == 0;
assert Answer.fromRoll(4) == 0;
assert Answer.fromRoll(5) == 1;
assert Answer.fromRoll(9) == 1;
assert Answer.fromRoll(10) == 2;
assert Answer.fromRoll(18) == 10;
assert Answer.fromRoll(19) == 0;
assert Answer.fromEntropy("\12") == 10;

assert Ledger.accountIdentifierText("\00\0f\10\ff") == "000f10ff";

let request : Types.SettleRequest = {
  blockIndex = 42;
  paymentId;
  questionCommitment = commitment;
  legacyMemo = 7;
};
assert Payment.validateRequest(request) == null;

let config : Types.TokenConfig = {
  network = "staging";
  ledgerCanisterId = Principal.fromText("aaaaa-aa");
  indexCanisterId = Principal.fromText("aaaaa-aa");
  tokenSymbol = "TESTICP";
  amount = 1_000_000;
  fee = 10_000;
  decimals = 8;
};

let transaction : Ledger.TransactionWithId = {
  id = 42;
  transaction = {
    memo = 0;
    icrc1_memo = ?commitment;
    operation = #Transfer({
      to = "000f10ff";
      fee = { e8s = 10_000 };
      from = "sender";
      amount = { e8s = 1_000_000 };
      spender = null;
    });
    created_at_time = null;
    timestamp = null;
  };
};

assert Payment.findTransaction([transaction], 42) == ?transaction;
assert Payment.findTransaction([transaction], 43) == null;
assert Payment.verifyTransaction(request, config, "000f10ff", transaction) == null;

let wrongAmount : Ledger.TransactionWithId = {
  transaction with
  transaction = {
    transaction.transaction with
    operation = #Transfer({
      to = "000f10ff";
      fee = { e8s = 10_000 };
      from = "sender";
      amount = { e8s = 999_999 };
      spender = null;
    });
  };
};

switch (Payment.verifyTransaction(request, config, "000f10ff", wrongAmount)) {
  case (?#amountMismatch(value)) {
    assert value.expected == 1_000_000;
    assert value.received == 999_999;
  };
  case (_) { assert false };
};
