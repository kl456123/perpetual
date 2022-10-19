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
import {P1FinalSettlement} from './P1FinalSettlement.sol';
import {BaseMath} from '../../lib/BaseMath.sol';
import {Require} from '../../lib/Require.sol';
import {I_P1Trader} from '../intf/I_P1Trader.sol';
import {P1Types} from '../lib/P1Types.sol';
import {SignedMath} from '../../lib/SignedMath.sol';

/**
 * @title P1Trade
 * @author dYdX
 *
 * @notice Contract for settling trades between two accounts. A "trade" in this context may refer
 *  to any approved transfer of balances, as determined by the smart contracts implementing the
 *  I_P1Trader interface and approved as global operators on the PerpetualV1 contract.
 */
contract P1Trade is P1FinalSettlement {
    using SafeMath for uint120;

    // ============ Structs ============

    struct TradeArg {
        uint256 takerIndex;
        uint256 makerIndex;
        address trader;
        uint8 assetIndex;
        bytes data;
    }

    // ============ Events ============

    event LogTrade(
        address indexed maker,
        address indexed taker,
        address trader,
        uint256 marginAmount,
        uint256 positionAmount,
        bool isBuy, // from taker's perspective
        bytes32 makerBalance,
        bytes32 takerBalance
    );

    // ============ Functions ============

    /**
     * @notice Submits one or more trades between any number of accounts.
     * @dev Emits the LogIndex event, one LogAccountSettled event for each account in `accounts`,
     *  and the LogTrade event for each trade in `trades`.
     *
     * @param  accounts  The sorted list of accounts that are involved in trades.
     * @param  trades    The list of trades to execute in-order.
     */
    function trade(address[] memory accounts, TradeArg[] memory trades)
        public
        noFinalSettlement
        nonReentrant
    {
        _verifyAccounts(accounts);

        bytes32 traderFlags = 0;
        for (uint i = 0; i < trades.length; i++) {
            TradeArg memory tradeArg = trades[i];

            require(
                _GLOBAL_OPERATORS_[tradeArg.trader],
                'trader is not global operator'
            );

            address maker = accounts[tradeArg.makerIndex];
            address taker = accounts[tradeArg.takerIndex];
            uint256 price = _MARKETS_[tradeArg.assetIndex].price;

            P1Types.TradeResult memory tradeResult = I_P1Trader(tradeArg.trader)
                .trade(
                    msg.sender,
                    maker,
                    taker,
                    price,
                    tradeArg.assetIndex,
                    tradeArg.data,
                    traderFlags
                );

            traderFlags |= tradeResult.traderFlags;

            // If the accounts are equal, no need to update balances.
            if (maker == taker) {
                continue;
            }

            // Modify currentBalances in-place. Note that `isBuy` is from the taker's perspective.

            if(tradeResult.isBuy){
                _updatePosition(taker, tradeArg.assetIndex, SignedMath.Int({value: tradeResult.positionAmount, isPositive: true}), SignedMath.Int({value: tradeResult.marginAmount, isPositive: false}));
                _updatePosition(maker, tradeArg.assetIndex, SignedMath.Int({value: tradeResult.positionAmount, isPositive: false}), SignedMath.Int({value: tradeResult.marginAmount, isPositive: true}));
            }else{
                _updatePosition(maker, tradeArg.assetIndex, SignedMath.Int({value: tradeResult.positionAmount, isPositive: true}), SignedMath.Int({value: tradeResult.marginAmount, isPositive: false}));
                _updatePosition(taker, tradeArg.assetIndex, SignedMath.Int({value: tradeResult.positionAmount, isPositive: false}), SignedMath.Int({value: tradeResult.marginAmount, isPositive: true}));
            }

            // update margin

            emit LogTrade(
                maker,
                taker,
                tradeArg.trader,
                tradeResult.marginAmount,
                tradeResult.positionAmount,
                tradeResult.isBuy,
                bytes32(0),
                bytes32(0)
            );
        }

    }

    /**
     * @dev Verify that `accounts` contains at least one address and that the contents are unique.
     *  We verify uniqueness by requiring that the array is sorted.
     */
    function _verifyAccounts(address[] memory accounts) private pure {
        require(accounts.length > 0, 'Accounts must have non-zero length');

        // Check that accounts are unique
        address prevAccount = accounts[0];
        for (uint256 i = 1; i < accounts.length; i++) {
            address account = accounts[i];
            require(
                account > prevAccount,
                'Accounts must be sorted and unique'
            );
            prevAccount = account;
        }
    }

    function _updatePosition(
        address account, uint8 assetId,
        SignedMath.Int memory marginDelta,
        SignedMath.Int memory positionDelta
    )internal{
        // settle funding
        _settleAccountTotally(account);

        SignedMath.Int memory initialPosition = _getAccountPosition(account, assetId);
        (SignedMath.Int memory initialTotalValue, SignedMath.Int memory initialTotalRisk) = getTotalValueAndTotalRisk(account);

        SignedMath.Int memory currentPosition = _addAsset(account, assetId, positionDelta);
        _addCollateral(account, marginDelta);

        _checkValidTransition(account, assetId, initialPosition, currentPosition, initialTotalValue, initialTotalRisk);

    }

    function _checkValidTransition(
        address account, uint8 assetId,
        SignedMath.Int memory initialPosition,
        SignedMath.Int memory currentPosition,
        SignedMath.Int memory initialTotalValue,
        SignedMath.Int memory initialTotalRisk
    ) internal view{
        P1Types.Market memory market = _MARKETS_[assetId];
        (SignedMath.Int memory currentTotalValue, SignedMath.Int memory currentTotalRisk) = getTotalValueAndTotalRisk(account);

        // See P1Settlement._isCollateralized().
            bool isCollateralized = !currentTotalValue.isPositive || currentTotalValue.value.mul(BaseMath.base()) >=
                currentTotalRisk.value.mul(_RISK_FACTOR_);

            if (isCollateralized) {
                return;
            }

        Require.that(
            _checkSmallerInPositionHoldings(initialPosition, currentPosition),
            'account is undercollateralized and sign is changed',
            account
                    );

        Require.that(
                initialTotalValue.value*currentTotalRisk.value<=currentTotalValue.value*initialTotalRisk.value,
                'account is undercollateralized and collateralization decreased',
                account
            );

            if(initialTotalRisk.value==0){
                Require.that(
                    initialTotalValue.value<=currentTotalValue.value,
                    'total value of account is decreased',
                    account
                );
            }
    }

    function _checkSmallerInPositionHoldings(
        SignedMath.Int memory initialPosition,
        SignedMath.Int memory currentPosition
    ) internal pure returns(bool){
        if(currentPosition.value==0){
            return true;
        }
        if(initialPosition.value==0){
            return false;
        }
        return currentPosition.gt(initialPosition);
    }
}
