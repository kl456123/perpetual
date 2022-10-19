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

import {SafeMath} from '@openzeppelin/contracts/math/SafeMath.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import {P1Settlement} from './P1Settlement.sol';
import {BaseMath} from '../../lib/BaseMath.sol';
import {Math} from '../../lib/Math.sol';
import {P1Types} from '../lib/P1Types.sol';
import { SignedMath } from '../../lib/SignedMath.sol';

/**
 * @title P1FinalSettlement
 * @author dYdX
 *
 * @notice Functions regulating the smart contract's behavior during final settlement.
 */
contract P1FinalSettlement is P1Settlement {
    using SafeMath for uint256;

    // ============ Events ============

    event LogWithdrawFinalSettlement(
        address indexed account,
        uint256 amount,
        bytes32 balance
    );

    // ============ Modifiers ============

    /**
     * @dev Modifier to ensure the function is not run after final settlement has been enabled.
     */
    modifier noFinalSettlement() {
        require(
            !_FINAL_SETTLEMENT_ENABLED_,
            'Not permitted during final settlement'
        );
        _;
    }

    /**
     * @dev Modifier to ensure the function is only run after final settlement has been enabled.
     */
    modifier onlyFinalSettlement() {
        require(
            _FINAL_SETTLEMENT_ENABLED_,
            'Only permitted during final settlement'
        );
        _;
    }

    // ============ Functions ============

    /**
     * @notice Withdraw the number of margin tokens equal to the value of the account at the time
     *  that final settlement occurred.
     * @dev Emits the LogAccountSettled and LogWithdrawFinalSettlement events.
     */
    function withdrawFinalSettlement()
        external
        onlyFinalSettlement
        nonReentrant
    {
        // Apply funding changes.
        _settleAccountTotally(msg.sender);

        // Determine the account net value.
        // `positive` and `negative` are base values with extra precision.
        (SignedMath.Int memory totalValue, ) =
            getTotalValueAndTotalRisk(msg.sender);

        // No amount is withdrawable.
        if (!totalValue.isPositive) {
            return;
        }

        // Get the account value, which is rounded down to the nearest token amount.
        uint256 accountValue = totalValue.value.div(BaseMath.base());

        // Get the number of tokens in the Perpetual Contract.
        uint256 contractBalance = IERC20(_TOKEN_).balanceOf(address(this));

        // Determine the maximum withdrawable amount.
        uint256 amountToWithdraw = Math.min(contractBalance, accountValue);

        // Update the user's balance.
        uint120 remainingMargin = accountValue
            .sub(amountToWithdraw)
            .toUint120();

        _MARGINS_[msg.sender] = SignedMath.Int({value: remainingMargin, isPositive: remainingMargin!=0});
        // clear all positions
        for(uint i=0;i<accountAssets[msg.sender].length; ++i){
            uint8 assetId = accountAssets[msg.sender][i];
            _POSITIONS_[assetId][msg.sender].position = 0;
        }

        // Send the tokens.
        SafeERC20.safeTransfer(IERC20(_TOKEN_), msg.sender, amountToWithdraw);

        // Emit the log.
        emit LogWithdrawFinalSettlement(
            msg.sender,
            amountToWithdraw,
            bytes32(0)
        );
    }
}
