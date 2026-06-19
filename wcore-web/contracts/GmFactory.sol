// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract GmFactory {
    address public immutable platformOwner;
    address public immutable implementation;
    address[] public contracts;
    mapping(address => bool) public isContract;

    event ContractDeployed(address indexed contractAddress, address indexed creator);

    constructor(address _platformOwner, address _implementation) {
        require(_platformOwner != address(0), "invalid platform");
        require(_implementation != address(0), "invalid implementation");
        platformOwner = _platformOwner;
        implementation = _implementation;
    }

    function deployGMContract() external payable {
        require(msg.value > 0, "insufficient fee");

        bytes20 target = bytes20(implementation);
        bytes memory code = abi.encodePacked(
            hex"3d602d80600a3d3981f3363d3d373d3d3d363d73",
            target,
            hex"5af43d82803e903d91602b57fd5bf3"
        );
        address clone;
        assembly {
            clone := create(0, add(code, 0x20), mload(code))
        }
        require(clone != address(0), "deploy failed");

        IGmOnChain(clone).initialize(msg.sender);

        contracts.push(clone);
        isContract[clone] = true;

        (bool ok, ) = platformOwner.call{value: msg.value}("");
        require(ok, "fee transfer failed");

        emit ContractDeployed(clone, msg.sender);
    }

    function getContractCount() external view returns (uint256) {
        return contracts.length;
    }

    function getAllContracts() external view returns (address[] memory) {
        return contracts;
    }

    function randomContract() external view returns (address) {
        require(contracts.length > 0, "no contracts");
        uint256 index = uint256(keccak256(abi.encodePacked(block.prevrandao, block.timestamp, contracts.length))) % contracts.length;
        return contracts[index];
    }
}

interface IGmOnChain {
    function initialize(address _creator) external;
}
