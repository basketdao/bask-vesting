
// SPDX-License-Identifier: MIT

pragma solidity ^0.7.3;

import "./MerkleDistributor.sol";

import "@openzeppelin/contracts/access/Ownable.sol";

contract MerkleDistributorWithRecover is MerkleDistributor, Ownable {
    constructor(address _owner, address token_, bytes32 merkleRoot_) MerkleDistributor(token_, merkleRoot_) {
        transferOwnership(_owner);
    }

    function recoverERC20(address _token) public onlyOwner {
        IERC20(_token).transfer(owner(), IERC20(_token).balanceOf(address(this)));
    }
}