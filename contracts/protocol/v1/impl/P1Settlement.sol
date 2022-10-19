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
import {P1Storage} from './P1Storage.sol';
import {BaseMath} from '../../lib/BaseMath.sol';
import {SafeCast} from '../../lib/SafeCast.sol';
import {SignedMath} from '../../lib/SignedMath.sol';
import {I_P1Funder} from '../intf/I_P1Funder.sol';
import {I_P1Oracle} from '../intf/I_P1Oracle.sol';
import {P1IndexMath} from '../lib/P1IndexMath.sol';
import {P1Types} from '../lib/P1Types.sol';

/**
 * @title P1Settlement
 * @author dYdX
 *
 * @notice Contract containing logic for settling funding payments between accounts.
 */
contract P1Settlement is P1Storage {
    using BaseMath for uint256;
    using SafeCast for uint256;
    using SafeMath for uint256;
    using P1IndexMath for P1Types.Index;
    using SignedMath for SignedMath.Int;

    // ============ Events ============

    event LogIndex(bytes32 index);

    event LogAccountSettled(
        address indexed account,
        bool isPositive,
        uint256 amount,
        bytes32 balance
    );

    // ============ Functions ============

    function _settleAccountTotally(address account) internal{
        for(uint i=0; i<accountAssets[account].length;++i){
            uint8 assetId = accountAssets[account][i];
            _settleAccount(account, assetId);
        }
    }

    /**
     * @dev Settle the funding payment for a single account and return its resulting balance.
     */
    function _settleAccount(address account, uint8 assetId)
        internal
    {
        P1Types.PositionAsset storage balance = _POSITIONS_[assetId][account];
        SignedMath.Int memory margin = _MARGINS_[account];
        P1Types.Index memory newIndex = _MARKETS_[assetId].index;
        SignedMath.Int memory oldIndex = SignedMath.Int({value: balance.cachedfundingIndex, isPositive: balance.isFundingPositive});

        // Store a cached copy of the index for this account.
        balance.cachedfundingIndex = newIndex.value;
        balance.isFundingPositive = newIndex.isPositive;

        // No need for settlement if balance is zero.
        if (balance.position == 0) {
            return ;
        }

        // Get the difference between the newIndex and oldIndex.
        SignedMath.Int memory signedIndexDiff = SignedMath.Int({
            isPositive: newIndex.isPositive,
            value: newIndex.value
        });
        if (oldIndex.isPositive) {
            signedIndexDiff = signedIndexDiff.sub(oldIndex.value);
        } else {
            signedIndexDiff = signedIndexDiff.add(oldIndex.value);
        }

        // By convention, positive funding (index increases) means longs pay shorts
        // and negative funding (index decreases) means shorts pay longs.
        bool settlementIsPositive = signedIndexDiff.isPositive !=
            balance.positionIsPositive;

        // Settle the account balance by applying the index delta as a credit or debit.
        // The interest amount scales with the position size.
        //
        // We round interest debits up and credits down to ensure that the contract won't become
        // insolvent due to rounding errors.
        uint256 settlementAmount;
        if (settlementIsPositive) {
            settlementAmount = signedIndexDiff.value.baseMul(balance.position);
            margin = margin.add(settlementAmount);
        } else {
            settlementAmount = signedIndexDiff.value.baseMulRoundUp(
                balance.position
            );
            margin = margin.sub(settlementAmount);
        }

        // update margin and funding timestamp
        _MARGINS_[account] = margin;

        // Log the change to the account balance, which is the negative of the change in the index.
        emit LogAccountSettled(
            account,
            settlementIsPositive,
            settlementAmount,
            bytes32(0)
        );
    }

    /**
     * @dev Returns true if the balance is collateralized according to the price and minimum
     * collateralization passed-in through the context.
     */
    function _isCollateralized(
        address account
    ) internal view returns (bool) {
        (SignedMath.Int memory currentTotalValue, SignedMath.Int memory currentTotalRisk) = getTotalValueAndTotalRisk(account);
        // check if account is underwater
        if(!currentTotalValue.isPositive){
            return false;
        }

        // See P1Settlement._isCollateralized().
            return currentTotalValue.value.mul(BaseMath.base()) >=
                currentTotalRisk.value.mul(_RISK_FACTOR_);
    }

    function _addAsset(address account, uint8 assetId, SignedMath.Int memory delta) internal returns(SignedMath.Int memory){
        uint8[] storage assetIds = accountAssets[account];
        P1Types.PositionAsset storage positionAsset = _POSITIONS_[assetId][account];
        SignedMath.Int memory initialPosition = SignedMath.Int({value: positionAsset.position, isPositive: positionAsset.positionIsPositive});
        if(delta.value==0){
            return initialPosition;
        }
        // if empty before
        if(positionAsset.position==0){
            assetIds.push(assetId);
        }

        // add delta to position
        SignedMath.Int memory finalPosition = initialPosition.signedAdd(delta);
        positionAsset.position = finalPosition.value;
        positionAsset.positionIsPositive = finalPosition.isPositive;

        // check if empty after applying delta. if that, remove assetId from assetIds
        if(finalPosition.value == 0){
            // We *must* have found the asset in the list or our redundant data structure is broken
          require(assetId < assetIds.length);

          // copy last item in list to location of item to be removed, reduce length by 1
          uint8[] storage storedList = accountAssets[account];
          storedList[assetId] = storedList[storedList.length - 1];
          storedList.length--;
        }

        require(assetIds.length<=_POSITION_MAX_SUPPORTED_N_ASSETS_);
        return finalPosition;
    }

    function _addCollateral(address account, SignedMath.Int memory marginDelta) internal{
        SignedMath.Int memory margin = _MARGINS_[account];
        margin = margin.signedAdd(marginDelta);
        _MARGINS_[account] = margin;
    }

    function getTotalValueAndTotalRisk(
        address account
    ) internal view returns(SignedMath.Int memory totalValue, SignedMath.Int memory totalRisk){
        totalValue = _MARGINS_[account];
        uint8[] memory assetIds = accountAssets[account];

        for(uint i=0; i<assetIds.length; ++i){
            P1Types.PositionAsset memory positionAsset = _POSITIONS_[assetIds[i]][account];
            uint256 positionValue = positionAsset.position.mul(_MARKETS_[assetIds[i]].price);
            totalValue = totalValue.signedAdd(SignedMath.Int({value: positionValue, isPositive: positionAsset.positionIsPositive}));
            totalRisk = totalRisk.add(positionValue);
        }
        return (totalValue, totalRisk);
    }

    function _getAccountPosition(address account, uint8 assetId) internal view returns(SignedMath.Int memory){
        P1Types.PositionAsset memory positionAsset = _POSITIONS_[assetId][account];
        return SignedMath.Int({value: positionAsset.position, isPositive: positionAsset.positionIsPositive});
    }
}
