// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.19;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC677Receiver} from "../interfaces/ERC677Receiver.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ERC677 is IERC20 {
    function transferAndCall(
        address to,
        uint value,
        bytes memory data
    ) external returns (bool success);
}

/**
 * @title LinkTokenMock
 * @notice Mock LINK token
 */
contract LinkTokenMock is ERC20, ERC677 {
    constructor() ERC20("Link", "LINK") {}

    /**
     * @dev transfer token to a contract address with additional data if the recipient is a contact.
     * @param _to The address to transfer to.
     * @param _value The amount to be transferred.
     * @param _data The extra data to be passed to the receiving contract.
     */
    function transferAndCall(
        address _to,
        uint _value,
        bytes memory _data
    ) public virtual override returns (bool success) {
        super.transfer(_to, _value);
        if (isContract(_to)) {
            contractFallback(_to, _value, _data);
        }
        return true;
    }

    // PRIVATE
    function contractFallback(
        address _to,
        uint _value,
        bytes memory _data
    ) private {
        ERC677Receiver receiver = ERC677Receiver(_to);
        receiver.onTokenTransfer(msg.sender, _value, _data);
    }

    function isContract(address _addr) private view returns (bool hasCode) {
        uint length;
        assembly {
            length := extcodesize(_addr)
        }
        return length > 0;
    }

    // for testing
    function mint(address _address, uint _amount) public {
        _mint(_address, _amount);
    }
}
