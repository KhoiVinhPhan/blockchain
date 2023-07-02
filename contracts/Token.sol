// SPDX-License-Identifier: MIT
// pragma solidity ^0.8.18;

// import "../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";

// contract Token is ERC20 {
//     string public message;
//     uint256 price = 0.01 ether; // price of 1 token in ether
//     uint256 number = 100;

//     constructor(string memory initMessage) ERC20("Tora tech", "TRT") {
//         _mint(msg.sender, 1_000_000 * 10 ** decimals());
//         message = initMessage;
//     }

//     function mint(address to, uint256 amount) public {
//         _mint(to, amount);
//     }

//     function burn(uint256 amount) external {
//         _burn(msg.sender, amount);
//     }

//     function buy() external payable {
//         require(msg.value > 0, "You must send some ether");
//         _mint(msg.sender, msg.value * 10 ** decimals() / price);
//     }

//     function getMessage() public view returns (string memory) {
//         return message;
//     }

//     function getMessageSub() public view returns (string memory) {
//         return message;
//     }
// }

pragma solidity ^0.8.18;
interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function mint(address account, uint256 amount) external returns (bool);
    
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

contract Token is IERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    string public message;
    uint256 public exchangeRate;

    struct Reservation {
        uint256 id;
        address admin;
        address teacher;
        address student;
        uint256 date;
        uint256 amount;
        uint256 amountForAdmin;
        uint256 amountForTeacher;
        bool paid;
        bool fulfilled;
    }

    mapping(uint256 => Reservation) public reservations;
    uint256 public reservationCounter;

    event ReservationCreated(uint256 id, address admin, address teacher, address student, uint256 date, uint256 amount);
    event TokensPurchased(address sender, address buyer, uint amount);

    constructor(string memory initMessage) {
        message = initMessage;
        name = "Tora Tech version 11";
        symbol = "TRT";
        decimals = 18;
        _totalSupply = 1000000 * 10**uint256(decimals);
        _balances[msg.sender] = _totalSupply;
        exchangeRate = 10000;
    }

    function createReservation(address teacher, address student, uint256 amount, uint256 amountForAdmin, uint256 amountForTeacher, uint256 date) external payable returns(uint256) {
        require(amount > 0, "Gia tri phai lon hon 0");
        reservationCounter++;
        reservations[reservationCounter] = Reservation(reservationCounter, msg.sender, teacher, student, date, amount, amountForAdmin, amountForTeacher, false, false); // create 1 Reservation vào reservations
        _balances[student] -= amount; // tru token cua student
        emit ReservationCreated(reservationCounter, msg.sender, teacher, student, date, amount);
        return reservationCounter;
    }

    function fulfillReservation(uint256 reservationId) external payable returns(bool) {
        Reservation storage reservation = reservations[reservationId];
        require(!reservation.fulfilled, "fulfill da duoc thuc hien");

        reservation.fulfilled = true;
        _balances[reservation.teacher] += reservation.amountForTeacher; // transfer token for teacher
        _balances[reservation.admin] += reservation.amountForAdmin; // transfer token for admin
        return true;
    }

    function canCelReservation(uint256 reservationId) external payable returns(bool) {
        Reservation storage reservation = reservations[reservationId];
        require(!reservation.paid, "Cancel da duoc thuc hien");

        reservation.paid = true;
        _balances[reservation.student] += reservation.amount; // refund token for student
        return true;
    }

    function buyTokenETH(address account) external payable returns(bool) {
        uint tokenAmount = msg.value * exchangeRate;
        require(balanceOf(msg.sender) >= tokenAmount, "Insufficient tokens in the contract");
        
        transfer(account, tokenAmount);
        emit TokensPurchased(msg.sender, account, tokenAmount);
        return true;
    }


    function mint(address account, uint256 amount) public override returns (bool) {
        require(account != address(0), "MintableToken: mint to the zero address");
        _totalSupply += amount;
        _balances[account] += amount;
        return true;
    }

    function totalSupply() public view override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view override returns (uint256) {
        return _balances[account];
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        require(amount <= _balances[msg.sender], "Insufficient balance");

        _balances[msg.sender] -= amount;
        _balances[recipient] += amount;

        emit Transfer(msg.sender, recipient, amount);
        return true;
    }

    function allowance(address owner, address spender) public view override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) public override returns (bool) {
        _allowances[spender][msg.sender] = amount;

        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public override returns (bool) {
        require(amount <= _balances[sender], "Insufficient balance");
        require(amount <= _allowances[sender][msg.sender], "Insufficient allowance");

        _balances[sender] -= amount;
        _balances[recipient] += amount;
        _allowances[sender][msg.sender] -= amount;

        emit Transfer(sender, recipient, amount);
        return true;
    }
}
