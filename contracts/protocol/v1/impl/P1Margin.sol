/*

    Copyright 2020 dYdX Trading Inc.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

*/

pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import {P1FinalSettlement} from './P1FinalSettlement.sol';
import {P1Getters} from './P1Getters.sol';
import {P1Types} from '../lib/P1Types.sol';

/**
 * @title P1Margin
 * @author dYdX
 *
 * @notice Contract for withdrawing and depositing.
 */
contract P1Margin is P1FinalSettlement, P1Getters {
    // ============ Events ============

    event LogDeposit(address indexed account, uint256 amount, bytes32 balance);

    event LogWithdraw(
        address indexed account,
        address destination,
        uint256 amount,
        bytes32 balance
    );

    // ============ Functions ============

    /**
     * @notice Deposit some amount of margin tokens from the msg.sender into an account.
     * @dev Emits LogIndex, LogAccountSettled, and LogDeposit events.
     *
     * @param  account  The account for which to credit the deposit.
     * @param  amount   the amount of tokens to deposit.
     */
    function deposit(address account, uint256 amount)
        external
        noFinalSettlement
        nonReentrant
    {
        _settleAccountTotally(account);

        SafeERC20.safeTransferFrom(
            IERC20(_TOKEN_),
            msg.sender,
            address(this),
            amount
        );

        _MARGINS_[account] = _MARGINS_[account].add(amount);

        emit LogDeposit(account, amount, bytes32(0));
    }

    /**
     * @notice Withdraw some amount of margin tokens from an account to a destination address.
     * @dev Emits LogIndex, LogAccountSettled, and LogWithdraw events.
     *
     * @param  account      The account for which to debit the withdrawal.
     * @param  destination  The address to which the tokens are transferred.
     * @param  amount       The amount of tokens to withdraw.
     */
    function withdraw(
        address account,
        address destination,
        uint256 amount
    ) external noFinalSettlement nonReentrant {
        require(
            hasAccountPermissions(account, msg.sender),
            'sender does not have permission to withdraw'
        );

        _settleAccountTotally(account);

        SafeERC20.safeTransfer(IERC20(_TOKEN_), destination, amount);

        _MARGINS_[account] = _MARGINS_[account].sub(amount);

        require(
            _isCollateralized(msg.sender),
            'account not collateralized'
        );

        emit LogWithdraw(account, destination, amount, bytes32(0));
    }
}
