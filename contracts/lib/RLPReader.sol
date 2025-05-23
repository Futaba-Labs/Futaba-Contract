// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.8.19;

/**
 * @title RLPReader
 * @dev Library for RLP decoding
 */

library RLPReader {
    uint8 constant STRING_SHORT_START = 0x80;
    uint8 constant STRING_LONG_START = 0xb8;
    uint8 constant LIST_SHORT_START = 0xc0;
    uint8 constant LIST_LONG_START = 0xf8;
    uint8 constant WORD_SIZE = 32;

    struct RLPItem {
        uint256 len;
        uint256 memPtr;
    }

    struct Iterator {
        RLPItem item; // Item that's being iterated over.
        uint256 nextPtr; // Position of the next item in the list.
    }

    /**
     * @notice Error if there is no iteration elements
     */
    error NotHasNext();

    /**
     * @notice Error if item lenght is not matched
     */
    error InvalidItemLength();

    /**
     * @notice Error if item is not a list
     */
    error NotList();

    /**
     * @notice Error if item overflows
     */
    error OverflowItem();

    /**
     * @dev Returns the next element in the iteration. Reverts if it has not next element.
     * @param self The iterator.
     * @return The next element in the iteration.
     */
    function next(Iterator memory self) internal pure returns (RLPItem memory) {
        if (!hasNext(self)) revert NotHasNext();

        uint256 ptr = self.nextPtr;
        uint256 itemLength = _itemLength(ptr);
        self.nextPtr = ptr + itemLength;

        return RLPItem(itemLength, ptr);
    }

    /**
     * @dev Returns true if the iteration has more elements.
     * @param self The iterator.
     * @return true if the iteration has more elements.
     */
    function hasNext(Iterator memory self) internal pure returns (bool) {
        RLPItem memory item = self.item;
        return self.nextPtr < item.memPtr + item.len;
    }

    /**
     * @dev Decode RLP encoded bytes into an RLPItem.
     * @param item RLP encoded bytes
     * @return RLPItem The decoded item
     */
    function toRlpItem(
        bytes memory item
    ) internal pure returns (RLPItem memory) {
        uint256 memPtr;
        assembly {
            memPtr := add(item, 0x20)
        }

        uint256 len = item.length;
        if (_itemLength(memPtr) != len) revert InvalidItemLength();
        return RLPItem(item.length, memPtr);
    }

    /**
     * @dev Create an iterator. Reverts if item is not a list.
     * @param self The RLP item.
     * @return An 'Iterator' over the item.
     */
    function iterator(
        RLPItem memory self
    ) internal pure returns (Iterator memory) {
        if (!isList(self)) revert NotList();

        uint256 ptr = self.memPtr + _payloadOffset(self.memPtr);
        return Iterator(self, ptr);
    }

    /**
     * @param item the RLP item.
     * @return Length of RLPItem.
     */
    function rlpLen(RLPItem memory item) internal pure returns (uint256) {
        return item.len;
    }

    /**
     * @param item the RLP item.
     * @return (memPtr, len) pair: location of the item's payload in memory.
     */
    function payloadLocation(
        RLPItem memory item
    ) internal pure returns (uint256, uint256) {
        uint256 offset = _payloadOffset(item.memPtr);
        uint256 memPtr = item.memPtr + offset;
        uint256 len = item.len - offset; // data length
        return (memPtr, len);
    }

    /**
     * @param item the RLP item.
     * @return Length of the item's payload.
     */
    function payloadLen(RLPItem memory item) internal pure returns (uint256) {
        (, uint256 len) = payloadLocation(item);
        return len;
    }

    /**
     * @param item the RLP item containing the encoded list.
     * @return The number of items in the encoded list.
     */
    function toList(
        RLPItem memory item
    ) internal pure returns (RLPItem[] memory) {
        if (!isList(item)) revert NotList();

        uint256 items = numItems(item);
        RLPItem[] memory result = new RLPItem[](items);

        uint256 memPtr = item.memPtr + _payloadOffset(item.memPtr);
        uint256 dataLen;
        for (uint256 i; i < items; i++) {
            dataLen = _itemLength(memPtr);
            result[i] = RLPItem(dataLen, memPtr);
            memPtr = memPtr + dataLen;
        }

        return result;
    }

    /**
     * @param item the RLP item.
     * @return true if the item is an RLP encoded list.
     */
    function isList(RLPItem memory item) internal pure returns (bool) {
        if (item.len == 0) return false;

        uint8 byte0;
        uint256 memPtr = item.memPtr;
        assembly {
            byte0 := byte(0, mload(memPtr))
        }

        if (byte0 < LIST_SHORT_START) return false;
        return true;
    }

    /**
     * @dev A cheaper version of keccak256(toRlpBytes(item)) that avoids copying memory.
     * @param item the RLP item.
     * @return keccak256 hash of RLP encoded bytes.
     */
    function rlpBytesKeccak256(
        RLPItem memory item
    ) internal pure returns (bytes32) {
        uint256 ptr = item.memPtr;
        uint256 len = item.len;
        bytes32 result;
        assembly {
            result := keccak256(ptr, len)
        }
        return result;
    }

    /**
     * @dev A cheaper version of keccak256(toBytes(item)) that avoids copying memory.
     * @param item the RLP item.
     * @return keccak256 hash of the item payload.
     */
    function payloadKeccak256(
        RLPItem memory item
    ) internal pure returns (bytes32) {
        (uint256 memPtr, uint256 len) = payloadLocation(item);
        bytes32 result;
        assembly {
            result := keccak256(memPtr, len)
        }
        return result;
    }

    /** RLPItem conversions into data types **/

    /**
     * @param item the RLP item.
     * @return RLP encoded bytes.
     */
    function toRlpBytes(
        RLPItem memory item
    ) internal pure returns (bytes memory) {
        bytes memory result = new bytes(item.len);
        if (result.length == 0) return result;

        uint256 ptr;
        assembly {
            ptr := add(0x20, result)
        }

        copy(item.memPtr, ptr, item.len);
        return result;
    }

    // any non-zero byte except "0x80" is considered true
    /**
     * @param item the RLP item.
     * @return bool value of item.
     */
    function toBoolean(RLPItem memory item) internal pure returns (bool) {
        if (item.len != 1) revert InvalidItemLength();
        uint256 result;
        uint256 memPtr = item.memPtr;
        assembly {
            result := byte(0, mload(memPtr))
        }

        // SEE Github Issue #5.
        // Summary: Most commonly used RLP libraries (i.e Geth) will encode
        // "0" as "0x80" instead of as "0". We handle this edge case explicitly
        // here.
        if (result == 0 || result == STRING_SHORT_START) {
            return false;
        } else {
            return true;
        }
    }

    /**
     * @param item the RLP item.
     * @return address value of item.
     */
    function toAddress(RLPItem memory item) internal pure returns (address) {
        // 1 byte for the length prefix
        if (item.len != 21) revert InvalidItemLength();

        return address(uint160(toUint(item)));
    }

    /**
     * @param item the RLP item.
     * @return uint value of item.
     */
    function toUint(RLPItem memory item) internal pure returns (uint256) {
        if (item.len <= 0) revert InvalidItemLength();
        if (item.len > 33) revert InvalidItemLength();

        (uint256 memPtr, uint256 len) = payloadLocation(item);

        uint256 result;
        assembly {
            result := mload(memPtr)

            // shift to the correct location if neccesary
            if lt(len, 32) {
                result := div(result, exp(256, sub(32, len)))
            }
        }

        return result;
    }

    /**
     * @dev enforces 32 byte length
     * @param item the RLP item.
     * @return uint256 value of item.
     */
    function toUintStrict(RLPItem memory item) internal pure returns (uint256) {
        // one byte prefix
        if (item.len != 33) revert InvalidItemLength();

        uint256 result;
        uint256 memPtr = item.memPtr + 1;
        assembly {
            result := mload(memPtr)
        }

        return result;
    }

    /**
     * @param item the RLP item.
     * @return bytes value of item.
     */
    function toBytes(RLPItem memory item) internal pure returns (bytes memory) {
        if (item.len == 0) revert InvalidItemLength();

        (uint256 memPtr, uint256 len) = payloadLocation(item);
        bytes memory result = new bytes(len);

        uint256 destPtr;
        assembly {
            destPtr := add(0x20, result)
        }

        copy(memPtr, destPtr, len);
        return result;
    }

    /**
     * @param item the RLP item.
     * @return _hash hashed bytes of item.
     */
    function toRlpBytesHash(
        RLPItem memory item
    ) internal pure returns (bytes32 _hash) {
        if (item.len == 0) revert InvalidItemLength();
        uint256 len = item.len;
        uint256 ptr = item.memPtr;
        assembly {
            _hash := keccak256(ptr, len)
        }
    }

    /* ----------------------------- Private Functions -------------------------------- */

    /**
     * @param item RLP encoded list.
     * @return number of payload items inside an encoded list.
     */
    function numItems(RLPItem memory item) internal pure returns (uint256) {
        if (item.len == 0) return 0;

        uint256 count = 0;
        uint256 currPtr = item.memPtr + _payloadOffset(item.memPtr);
        uint256 endPtr = item.memPtr + item.len;
        while (currPtr < endPtr) {
            currPtr = currPtr + _itemLength(currPtr); // skip over an item
            count++;
        }
        uint256 len = item.len;

        if (_itemLength(item.memPtr) != len) revert InvalidItemLength();

        return count;
    }

    /**
     * @param memPtr memory pointer
     * @return uint256 entire rlp item byte length
     */
    function _itemLength(uint256 memPtr) private pure returns (uint256) {
        uint256 itemLen;
        uint256 byte0;
        assembly {
            byte0 := byte(0, mload(memPtr))
        }

        if (byte0 < STRING_SHORT_START) {
            itemLen = 1;
        } else if (byte0 < STRING_LONG_START) {
            itemLen = byte0 - STRING_SHORT_START + 1;
        } else if (byte0 < LIST_SHORT_START) {
            assembly {
                let byteLen := sub(byte0, 0xb7) // # of bytes the actual length is
                memPtr := add(memPtr, 1) // skip over the first byte

                /* 32 byte word size */
                let dataLen := div(mload(memPtr), exp(256, sub(32, byteLen))) // right shifting to get the len
                itemLen := add(dataLen, add(byteLen, 1))
            }
        } else if (byte0 < LIST_LONG_START) {
            itemLen = byte0 - LIST_SHORT_START + 1;
        } else {
            assembly {
                let byteLen := sub(byte0, 0xf7)
                memPtr := add(memPtr, 1)

                let dataLen := div(mload(memPtr), exp(256, sub(32, byteLen))) // right shifting to the correct length
                itemLen := add(dataLen, add(byteLen, 1))
            }
        }

        return itemLen;
    }

    /**
     * @param memPtr memory pointer
     * @return uint256 number of bytes until the data
     */
    function _payloadOffset(uint256 memPtr) private pure returns (uint256) {
        uint256 byte0;
        assembly {
            byte0 := byte(0, mload(memPtr))
        }

        if (byte0 < STRING_SHORT_START) {
            return 0;
        } else if (
            byte0 < STRING_LONG_START ||
            (byte0 >= LIST_SHORT_START && byte0 < LIST_LONG_START)
        ) {
            return 1;
        } else if (byte0 < LIST_SHORT_START) {
            // being explicit
            return byte0 - (STRING_LONG_START - 1) + 1;
        } else {
            return byte0 - (LIST_LONG_START - 1) + 1;
        }
    }

    /**
     * @param src Pointer to source
     * @param dest Pointer to destination
     * @param len Amount of memory to copy from the source
     */
    function copy(uint256 src, uint256 dest, uint256 len) private pure {
        if (len == 0) return;

        // copy as many word sizes as possible
        for (; len >= WORD_SIZE; len -= WORD_SIZE) {
            assembly {
                mstore(dest, mload(src))
            }

            src += WORD_SIZE;
            dest += WORD_SIZE;
        }

        if (len > 0) {
            // left over bytes. Mask is used to remove unwanted bytes from the word
            uint256 mask = 256 ** (WORD_SIZE - len) - 1;
            assembly {
                let srcpart := and(mload(src), not(mask)) // zero out src
                let destpart := and(mload(dest), mask) // retrieve the bytes
                mstore(dest, or(destpart, srcpart))
            }
        }
    }

    /**
     * @param item the RLP item.
     * @param idx the index of the item.
     * @return RLPItem the item at idx.
     */
    function safeGetItemByIndex(
        RLPItem memory item,
        uint idx
    ) internal pure returns (RLPItem memory) {
        if (!isList(item)) revert NotList();

        uint endPtr = item.memPtr + item.len;

        uint memPtr = item.memPtr + _payloadOffset(item.memPtr);
        uint dataLen;
        for (uint i; i < idx; i++) {
            dataLen = _itemLength(memPtr);
            memPtr = memPtr + dataLen;
        }
        dataLen = _itemLength(memPtr);

        if (memPtr + dataLen > endPtr) revert OverflowItem();
        return RLPItem(dataLen, memPtr);
    }
}
