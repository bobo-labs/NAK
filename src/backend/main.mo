import Map "mo:core/Map";
import Principal "mo:core/Principal";

import OracleMixin "mixins/Oracle";
import Types "types";

actor Oracle {
  let receipts = Map.empty<Nat64, Types.Receipt>();
  include OracleMixin(receipts, Principal.fromActor(Oracle));
};
