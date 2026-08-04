import Principal "mo:core/Principal";
import Nat64 "mo:core/Nat64";
import Nat8 "mo:core/Nat8";

module {
  let hexDigits : [Text] = [
    "0", "1", "2", "3", "4", "5", "6", "7",
    "8", "9", "a", "b", "c", "d", "e", "f",
  ];

  public type Account = {
    owner : Principal;
    subaccount : ?Blob;
  };

  public type Tokens = { e8s : Nat64 };
  public type Timestamp = { timestamp_nanos : Nat64 };

  public type Operation = {
    #Approve : {
      fee : Tokens;
      from : Text;
      allowance : Tokens;
      expires_at : ?Timestamp;
      spender : Text;
      expected_allowance : ?Tokens;
    };
    #Burn : { from : Text; amount : Tokens; spender : ?Text };
    #Mint : { to : Text; amount : Tokens };
    #Transfer : {
      to : Text;
      fee : Tokens;
      from : Text;
      amount : Tokens;
      spender : ?Text;
    };
  };

  public type Transaction = {
    memo : Nat64;
    icrc1_memo : ?Blob;
    operation : Operation;
    created_at_time : ?Timestamp;
    timestamp : ?Timestamp;
  };

  public type TransactionWithId = { id : Nat64; transaction : Transaction };

  public type CandidOperation = {
    #Approve : {
      fee : Tokens;
      from : Blob;
      allowance_e8s : Int;
      allowance : Tokens;
      expected_allowance : ?Tokens;
      expires_at : ?Timestamp;
      spender : Blob;
    };
    #Burn : { from : Blob; amount : Tokens; spender : ?Blob };
    #Mint : { to : Blob; amount : Tokens };
    #Transfer : {
      to : Blob;
      fee : Tokens;
      from : Blob;
      amount : Tokens;
      spender : ?Blob;
    };
  };

  public type CandidTransaction = {
    memo : Nat64;
    icrc1_memo : ?Blob;
    operation : ?CandidOperation;
    created_at_time : Timestamp;
  };

  public type CandidBlock = {
    transaction : CandidTransaction;
    timestamp : Timestamp;
    parent_hash : ?Blob;
  };

  public type QueryBlocksResponse = {
    blocks : [CandidBlock];
    first_block_index : Nat64;
  };

  public type TransactionsResponse = {
    balance : Nat64;
    transactions : [TransactionWithId];
    oldest_tx_id : ?Nat64;
  };

  public type TransactionsResult = {
    #Ok : TransactionsResponse;
    #Err : { message : Text };
  };

  public type Index = actor {
    get_account_transactions : shared query ({
      account : Account;
      start : ?Nat;
      max_results : Nat;
    }) -> async TransactionsResult;
  };

  public type Ledger = actor {
    account_identifier : shared query Account -> async Blob;
    query_blocks : shared query ({ start : Nat64; length : Nat64 }) -> async QueryBlocksResponse;
  };

  public func index(canisterId : Principal) : Index {
    actor (canisterId.toText());
  };

  public func ledger(canisterId : Principal) : Ledger {
    actor (canisterId.toText());
  };

  public func accountIdentifierText(value : Blob) : Text {
    var result = "";
    for (byte in value.values()) {
      let number = byte.toNat();
      result #= hexDigits[number / 16] # hexDigits[number % 16];
    };
    result;
  };

  public func findLedgerBlock(
    response : QueryBlocksResponse,
    blockIndex : Nat64,
  ) : ?CandidBlock {
    if (blockIndex < response.first_block_index) {
      return null;
    };

    let offset = Nat64.toNat(blockIndex - response.first_block_index);
    if (offset >= response.blocks.size()) {
      null
    } else {
      ?response.blocks[offset]
    };
  };
};
