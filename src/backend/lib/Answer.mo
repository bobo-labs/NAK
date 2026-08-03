import Nat8 "mo:core/Nat8";

module {
  public let answerCount : Nat8 = 11;

  // Mirrors the existing frontend distribution: No and Nothing are each 5/19;
  // every other recorded answer is 1/19.
  public func fromRoll(roll : Nat) : Nat8 {
    let normalized = roll % 19;
    if (normalized < 5) {
      0
    } else if (normalized < 10) {
      1
    } else {
      switch (normalized) {
        case (10) { 2 };
        case (11) { 3 };
        case (12) { 4 };
        case (13) { 5 };
        case (14) { 6 };
        case (15) { 7 };
        case (16) { 8 };
        case (17) { 9 };
        case (_) { 10 };
      }
    };
  };

  public func fromEntropy(entropy : Blob) : Nat8 {
    // Reject values 247...255 so each of 19 buckets is equally likely.
    for (byte in entropy.values()) {
      let value = byte.toNat();
      if (value < 247) {
        return fromRoll(value);
      };
    };

    // All 32 bytes landing in the rejection range is astronomically unlikely.
    0;
  };
};
