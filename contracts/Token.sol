// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Token is ERC20 {
    string public message;
    uint256 price = 0.01 ether; // price of 1 token in ether
    uint256 number = 100;

    constructor(string memory initMessage) ERC20("Tora tech", "TRT") {
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
        message = initMessage;
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function buy() external payable {
        require(msg.value > 0, "You must send some ether");
        _mint(msg.sender, msg.value * 10 ** decimals() / price);
    }

    function getMessage() public view returns (string memory) {
        return message;
    }

    function getMessageSub() public view returns (string memory) {
        return message;
    }
}
