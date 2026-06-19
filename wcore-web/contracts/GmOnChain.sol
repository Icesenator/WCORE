// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract GmOnChain {
    address public creator;
    address public platformOwner;
    bool public initialized;
    bool public paused;
    uint256 public creatorBalance;
    uint256 public platformBalance;

    mapping(address => uint256) public lastGmTimestamp;

    event GmCheckedIn(address indexed user, uint256 timestamp, uint256 streak, uint256 value);
    event CreatorWithdrew(address indexed creator, uint256 amount);
    event PlatformWithdrew(address indexed platform, uint256 amount);
    event Initialized(address creator, address platformOwner);
    event Paused(address indexed platform);
    event Unpaused(address indexed platform);
    event CreatorPayoutChanged(address indexed creator, address newPayout);

    modifier onlyCreator() { require(msg.sender == creator, "not creator"); _; }
    modifier onlyPlatform() { require(msg.sender == platformOwner, "not platform"); _; }
    modifier whenNotPaused() { require(!paused, "gm is paused"); _; }

    function initialize(address _creator) external {
        require(!initialized, "already initialized");
        require(_creator != address(0), "invalid creator");
        creator = _creator;
        platformOwner = IGmFactory(msg.sender).platformOwner();
        require(platformOwner != address(0), "invalid platform");
        initialized = true;
        emit Initialized(_creator, platformOwner);
    }

    function sayGm(uint256 _streak) external payable whenNotPaused {
        require(msg.value > 0, "insufficient fee");
        require(lastGmTimestamp[msg.sender] / 1 days < block.timestamp / 1 days, "already gm today");
        lastGmTimestamp[msg.sender] = block.timestamp;

        uint256 half = msg.value / 2;
        creatorBalance += half;
        platformBalance += msg.value - half;

        emit GmCheckedIn(msg.sender, block.timestamp, _streak, msg.value);
    }

    function withdrawCreator() external onlyCreator {
        uint256 amount = creatorBalance;
        _withdrawTo(creator, amount, true);
        emit CreatorWithdrew(creator, amount);
    }

    function withdrawCreatorTo(address _to) external onlyCreator {
        require(_to != address(0), "invalid address");
        uint256 amount = creatorBalance;
        require(amount > 0, "nothing to withdraw");
        creatorBalance = 0;
        (bool ok, ) = _to.call{value: amount}("");
        require(ok, "transfer failed");
        emit CreatorWithdrew(_to, amount);
    }

    function withdrawPlatform() external onlyPlatform {
        uint256 amount = platformBalance;
        require(amount > 0, "nothing to withdraw");
        platformBalance = 0;
        (bool ok, ) = platformOwner.call{value: amount}("");
        require(ok, "transfer failed");
        emit PlatformWithdrew(platformOwner, amount);
    }

    function setPaused(bool _paused) external onlyPlatform {
        paused = _paused;
        if (_paused) emit Paused(platformOwner);
        else emit Unpaused(platformOwner);
    }

    receive() external payable { revert(); }

    function _withdrawTo(address _to, uint256 _amount, bool _reset) private {
        require(_amount > 0, "nothing to withdraw");
        if (_reset) creatorBalance = 0;
        (bool ok, ) = _to.call{value: _amount}("");
        require(ok, "transfer failed");
    }
}

interface IGmFactory {
    function platformOwner() external view returns (address);
}
