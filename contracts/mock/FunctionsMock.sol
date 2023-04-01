// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;
pragma experimental ABIEncoderV2;

import "../interfaces/IOracle.sol";
import "../interfaces/ILightClientMock.sol";
import "../QueryType.sol";
import "hardhat/console.sol";

contract FunctionsMock is IOracle {
    ILightClientMock public lightClient;
    event ExecuteRequest(
        string source,
        bytes secrets,
        IOracle.Location secretsLocation,
        string[] args,
        uint64 subscriptionId,
        uint32 gasLimit
    );

    function executeRequest(
        string calldata source,
        bytes calldata secrets,
        IOracle.Location secretsLocation,
        string[] calldata args,
        uint64 subscriptionId,
        uint32 gasLimit
    ) external returns (bytes32) {
        emit ExecuteRequest(
            source,
            secrets,
            secretsLocation,
            args,
            subscriptionId,
            gasLimit
        );

        return bytes32(0);
    }

    /**
     * @notice This function receives data from Oracle (Chainlink Funcitons) to update block headers in Light Client
     * @param requestId Block header information received from Oracle
     * @param response Block header information received from Oracle
     */
    function fillFulfillment(
        bytes32 requestId,
        bytes calldata response
    ) external {
        uint256 length = uint256(
            stringToUint(getElementAtIndex(string(response), 0))
        );
        QueryType.OracleResponse[]
            memory responses = new QueryType.OracleResponse[](length);

        uint256 index = 1;
        uint256 resultIndex = 0;
        uint256 responseIndex = 0;
        string memory result = "0";
        string[] memory results = new string[](3);
        while (keccak256(abi.encode(result)) != keccak256(abi.encode(""))) {
            result = getElementAtIndex(string(response), index);
            console.log(result);
            results[resultIndex] = result;
            if (resultIndex == 2) {
                uint32 chainId = uint32(stringToUint(results[0]));
                uint256 height = uint256(stringToUint(results[1]));
                bytes32 root = bytes32(uint256(stringToUint(results[2])));

                QueryType.OracleResponse memory res = QueryType.OracleResponse(
                    chainId,
                    height,
                    root
                );
                responses[responseIndex] = res;
                responseIndex++;
                resultIndex = 0;
            } else {
                resultIndex++;
            }
            index++;
        }
        lightClient.updateHeader(responses);
    }

    function setLightClient(address _lightClient) external {
        lightClient = ILightClientMock(_lightClient);
    }

    /*  Helper functions */
    function stringToUint(string memory s) internal pure returns (uint) {
        bytes memory b = bytes(s);
        uint result = 0;
        for (uint i = 0; i < b.length; i++) {
            if (b[i] >= "0" && b[i] <= "9") {
                result = result * 10 + (uint8(b[i]) - 48);
            }
        }
        return result;
    }

    function getElementAtIndex(
        string memory _str,
        uint256 _index
    ) internal pure returns (string memory) {
        bytes memory strBytes = bytes(_str);
        uint256 index = 0;
        uint256 start = 0;
        uint256 end = 0;
        for (uint256 i = 0; i < strBytes.length; i++) {
            if (strBytes[i] == '"' && index != 0) {
                return "";
            }
            if (strBytes[i] == ",") {
                if (index == _index) {
                    end = i;
                    if (index == 0) {
                        start = start + 1;
                    }
                    break;
                }
                index++;
                start = i + 1;
            }
        }
        bytes memory result = new bytes(end - start);
        for (uint256 i = start; i < end; i++) {
            result[i - start] = strBytes[i];
        }
        return string(result);
    }
}
