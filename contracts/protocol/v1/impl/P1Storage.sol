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

import {Adminable} from '../../lib/Adminable.sol';
import {ReentrancyGuard} from '../../lib/ReentrancyGuard.sol';
import {P1Types} from '../lib/P1Types.sol';
import {SignedMath} from '../../lib/SignedMath.sol';

/**
 * @title P1Storage
 * @author dYdX
 *
 * @notice Storage contract. Contains or inherits from all contracts that have ordered storage.
 */
contract P1Storage is Adminable, ReentrancyGuard {
    // mapping(assetId => mapping( account => balance ))
    mapping(uint8 => mapping(address => P1Types.PositionAsset)) public _POSITIONS_;
    // mapping(uint8 => mapping(address => SignedMath.Int)) public _LOCAL_INDEXES_;
    // mapping(uint8 => mapping(address => SignedMath.Int)) public _POSITIONS_;
    mapping(address => SignedMath.Int) public _MARGINS_;
    mapping(address => uint) public _FUNDING_TIMESTAMPS_;

    mapping(uint8 => P1Types.Market) public _MARKETS_;

    mapping(address => uint8[]) public accountAssets;

    mapping(address => bool) internal _GLOBAL_OPERATORS_;
    mapping(address => mapping(address => bool)) internal _LOCAL_OPERATORS_;

    address internal _TOKEN_;
    address internal _ORACLE_;
    address internal _FUNDER_;

    uint256 internal _MIN_COLLATERAL_;

    uint256 internal _RISK_FACTOR_;

    bool internal _FINAL_SETTLEMENT_ENABLED_;
    uint256 internal _FINAL_SETTLEMENT_PRICE_;

    uint8 internal _POSITION_MAX_SUPPORTED_N_ASSETS_;
}
