// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/*`
 * @title TrieProofs
 * @dev Library for verifing Merkle Patricia Proofs
 * @notice Forked from: https://github.com/lorenzb/proveth/blob/master/onchain/ProvethVerifier.sol
 */

import {RLPReader} from "./RLPReader.sol";

library TrieProofs {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for bytes;

    bytes32 internal constant EMPTY_TRIE_ROOT_HASH =
        0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421;

    /**
     * @notice Error if hash is empty
     */
    error BadEmptyProof();

    /**
     * @notice Error if first proof part is invalid
     */
    error BadFirstProofPart();

    /**
     * @notice Error if hash is invalid
     */
    error BadHash();

    /**
     * @notice Error if invalid proof
     */
    error UnexpectedEndOfProof();

    /**
     * @notice Error if invalid node length
     */
    error InvalidNodeLength();

    /**
     * @notice Error if the next path item is not empty
     */
    error InvalidExclusionProof();

    /**
     * @notice Error if continuing branch has depleted path
     */
    error ContinuingBranchDepletedPath();

    /**
     * @notice Error if invalid node
     */
    error InvalidNode();

    /**
     * @notice Error if invalid nibble position
     */
    error InvalidNibblePosition();

    /**
     * @notice Error if empty bytes array
     */
    error EmptyBytesArray();

    /**
     * @notice Error if skip nibbles amount too large
     */
    error SkipNibblesAmountTooLarge();

    /**
     * @notice Verifies a Merkle Patricia proof.
     * @param proofRLP RLP encoded Merkle Patricia proof
     * @param rootHash Root hash of the Merkle Patricia proof
     * @param path32 Path to the value in the Merkle Patricia proof
     * @return value The value in the Merkle Patricia proof
     */
    function verify(
        bytes memory proofRLP, //storageProof
        bytes32 rootHash, // accountRoot
        bytes32 path32 // keccak256(abi.encodePacked(slot));
    ) internal pure returns (bytes memory value) {
        bytes memory path = new bytes(32);
        assembly {
            mstore(add(path, 0x20), path32)
        } // careful as path may need to be 64
        path = decodeNibbles(path, 0); // lol, so efficient

        RLPReader.RLPItem[] memory proof = proofRLP.toRlpItem().toList();

        uint8 nodeChildren;
        RLPReader.RLPItem memory children;

        uint256 pathOffset = 0; // Offset of the proof
        bytes32 nextHash; // Required hash for the next node

        if (proof.length == 0) {
            // Root hash of empty tx trie
            if (rootHash != EMPTY_TRIE_ROOT_HASH) revert BadEmptyProof();
            return new bytes(0);
        }

        for (uint256 i = 0; i < proof.length; i++) {
            // We use the fact that an rlp encoded list consists of some
            // encoding of its length plus the concatenation of its
            // *rlp-encoded* items.
            bytes memory rlpNode = proof[i].toRlpBytes();

            if (i == 0) {
                if (rootHash != keccak256(rlpNode)) revert BadFirstProofPart();
            } else {
                if (nextHash != keccak256(rlpNode)) revert BadHash();
            }

            RLPReader.RLPItem[] memory node = proof[i].toList();

            // Extension or Leaf node
            if (node.length == 2) {
                /*
                // proof claims divergent extension or leaf
                if (proofIndexes[i] == 0xff) {
                    require(i >= proof.length - 1); // divergent node must come last in proof
                    require(prefixLength != nodePath.length); // node isn't divergent
                    require(pathOffset == path.length); // didn't consume entire path

                    return new bytes(0);
                }

                require(proofIndexes[i] == 1); // an extension/leaf node only has two fields.
                require(prefixLength == nodePath.length); // node is divergent
                */

                bytes memory nodePath = merklePatriciaCompactDecode(
                    node[0].toBytes()
                );
                pathOffset += sharedPrefixLength(pathOffset, path, nodePath);

                // last proof item
                if (i == proof.length - 1) {
                    if (pathOffset != path.length)
                        revert UnexpectedEndOfProof();
                    return node[1].toBytes(); // Data is the second item in a leaf node
                } else {
                    // not last proof item
                    children = node[1];
                    if (!children.isList()) {
                        nextHash = getNextHash(children);
                    } else {
                        nextHash = keccak256(children.toRlpBytes());
                    }
                }
            } else {
                // Must be a branch node at this point
                if (node.length != 17) revert InvalidNodeLength();

                if (i == proof.length - 1) {
                    // Proof ends in a branch node, exclusion proof in most cases
                    if (pathOffset + 1 == path.length) {
                        return node[16].toBytes();
                    } else {
                        nodeChildren = extractNibble(path32, pathOffset);
                        children = node[nodeChildren];

                        // Ensure that the next path item is empty, end of exclusion proof
                        if (children.toBytes().length != 0)
                            revert InvalidExclusionProof();
                        return new bytes(0);
                    }
                } else {
                    if (pathOffset >= path.length)
                        revert ContinuingBranchDepletedPath();

                    nodeChildren = extractNibble(path32, pathOffset);
                    children = node[nodeChildren];

                    pathOffset += 1; // advance by one

                    // not last level
                    if (!children.isList()) {
                        nextHash = getNextHash(children);
                    } else {
                        nextHash = keccak256(children.toRlpBytes());
                    }
                }
            }
        }

        // no invalid proof should ever reach this point
        assert(false);
    }

    function getNextHash(
        RLPReader.RLPItem memory node
    ) internal pure returns (bytes32 nextHash) {
        bytes memory nextHashBytes = node.toBytes();
        if (nextHashBytes.length != 32) revert InvalidNode();

        assembly {
            nextHash := mload(add(nextHashBytes, 0x20))
        }
    }

    /**
     * @dev Nibble is extracted as the least significant nibble in the returned byte
     * @param path keccak256(abi.encodePacked(slot))
     * @param position position of the nibble
     * @return nibble
     */
    function extractNibble(
        bytes32 path,
        uint256 position
    ) internal pure returns (uint8 nibble) {
        if (position >= 64) revert InvalidNibblePosition();
        bytes1 shifted = position == 0
            ? bytes1(path >> 4)
            : bytes1(path << ((position - 1) * 4));
        bytes1 f = hex"0f";
        return uint8(bytes1(shifted & f));
    }

    /**
     * @dev Decodes a compact-encoded nibble array.
     * @param compact The compact-encoded nibble array.
     * @param skipNibbles The number of nibbles to skip.
     * @return nibbles The decoded nibble array.
     */
    function decodeNibbles(
        bytes memory compact,
        uint skipNibbles
    ) internal pure returns (bytes memory nibbles) {
        if (compact.length == 0) revert EmptyBytesArray();

        uint length = compact.length * 2;
        if (skipNibbles > length) revert SkipNibblesAmountTooLarge();
        length -= skipNibbles;

        nibbles = new bytes(length);
        uint nibblesLength = 0;

        for (uint i = skipNibbles; i < skipNibbles + length; i += 1) {
            if (i % 2 == 0) {
                nibbles[nibblesLength] = bytes1(
                    (uint8(compact[i / 2]) >> 4) & 0xF
                );
            } else {
                nibbles[nibblesLength] = bytes1(
                    (uint8(compact[i / 2]) >> 0) & 0xF
                );
            }
            nibblesLength += 1;
        }

        assert(nibblesLength == nibbles.length);
    }

    /**
     * @dev Decodes a compact-encoded nibble array.
     * @param compact The compact-encoded nibble array.
     * @return nibbles The decoded nibble array.
     */
    function merklePatriciaCompactDecode(
        bytes memory compact
    ) internal pure returns (bytes memory nibbles) {
        if (compact.length == 0) revert EmptyBytesArray();
        uint first_nibble = (uint8(compact[0]) >> 4) & 0xF;
        uint skipNibbles;
        if (first_nibble == 0) {
            skipNibbles = 2;
        } else if (first_nibble == 1) {
            skipNibbles = 1;
        } else if (first_nibble == 2) {
            skipNibbles = 2;
        } else if (first_nibble == 3) {
            skipNibbles = 1;
        } else {
            // Not supposed to happen!
            revert();
        }
        return decodeNibbles(compact, skipNibbles);
    }

    /**
     * @dev Returns the length of the shared prefix of two byte arrays.
     * @param xsOffset The offset of the first byte array.
     * @param xs The first byte array.
     * @param ys The second byte array.
     * @return length The length of the shared prefix.
     */
    function sharedPrefixLength(
        uint xsOffset,
        bytes memory xs,
        bytes memory ys
    ) internal pure returns (uint) {
        uint256 i = 0;
        for (i = 0; i + xsOffset < xs.length && i < ys.length; i++) {
            if (xs[i + xsOffset] != ys[i]) {
                return i;
            }
        }
        return i;
    }
}
