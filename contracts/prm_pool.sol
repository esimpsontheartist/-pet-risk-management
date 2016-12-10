pragma solidity ^0.4.6;
/* 
	Interface to REGA pool contracts   
*/
contract poolAccounts {
    enum an {_number, _cases, _01_reserve, _02_contribution, _03_commission, _04_super_pool, _05_support, _06_payments, _10_loan, _11_cash, _99_balance }
    address public owner;
	int[11] public accounts;
	function changeBalance(int _amount, an _account) internal {
	    if(_account == an._number) {accounts[0]+= _amount; return;}
	    if(_account == an._cases) {accounts[1]+= _amount; return;}
	    if(_account == an._01_reserve) {accounts[2]+= _amount; return;}
	    if(_account == an._02_contribution) {accounts[3]+= _amount; return;}
	    if(_account == an._03_commission) {accounts[4]+= _amount; return;}
	    if(_account == an._04_super_pool) {accounts[5]+= _amount; return;}
	    if(_account == an._05_support) {accounts[6]+= _amount; return;}
	    if(_account == an._06_payments) {accounts[7]+= _amount; return;}
	    if(_account == an._10_loan) {accounts[8]+= _amount; return;}
	    if(_account == an._11_cash) {accounts[9]+= _amount; return;}
	    if(_account == an._99_balance) {accounts[10]+= _amount; return;}
	}
	function getBalance(an _account) internal constant returns(int _balance) {
	    if(_account == an._number) {return accounts[0];}
	    if(_account == an._cases) {return accounts[1];}
	    if(_account == an._01_reserve) {return accounts[2];}
	    if(_account == an._02_contribution) {return accounts[3];}
	    if(_account == an._03_commission) {return accounts[4];}
	    if(_account == an._04_super_pool) {return accounts[5];}
	    if(_account == an._05_support) {return accounts[6];}
	    if(_account == an._06_payments) {return accounts[7];}
	    if(_account == an._10_loan) {return accounts[8];}
	    if(_account == an._11_cash) {return accounts[9];}
	    if(_account == an._99_balance) {return accounts[10];}
	}
	function isValid() public constant returns(bool _valid) {
	    bool result = true;
	    int balance = 0;
	    for(uint i=2; i<accounts.length; i++) balance+= accounts[i];
	    if (balance != 0) result = false;
	    return result;
	}
	function posting(an _dr, an _cr, int _amount) public {
	    changeBalance(-_amount, _dr); changeBalance(_amount, _cr);
	}
	function update(int _number, int _case) public {
	    accounts[0]+= _number; accounts[1]+= _case;
	}
}
contract poolMember is poolAccounts {
	pool public parent;
	int  public limit;
	function getPool(uint _level) public constant returns(pool _pool) {
	    return parent.getPool(_level);
	}
	function posting(an _dr, an _cr, int _amount) {
	   poolAccounts.posting(_dr, _cr, _amount);
	   poolAccounts(parent).posting(_dr, _cr, _amount);
	}
	function update(int _number, int _case) {
	    poolAccounts.update(_number, _case);
	    poolAccounts(parent).update(_number, _case);
	}
	function setParent(pool _parent) public {
	    parent = _parent;
	}
	function loan(int _amount) public {
		uint _level = pool(msg.sender).level();
		if(!checkLimit(_amount) || this.balance < uint(_amount) || parent == pool(0) || getPool(_level) != pool(msg.sender)) throw;
		int _loan = _amount - getBalance(an._01_reserve);
		if(_loan <= 0) _loan = 0;
		poolAccounts.posting(an._10_loan, an._01_reserve, _loan);
		parent.loan(_loan,_level);
	}
	function checkLimit(int _loan) public constant returns(bool) {
		if(limit + poolAccounts.getBalance(an._10_loan) - _loan >= 0) return true;
		return false;
	}
}
contract riskManager {
	uint public risk;		// current risk 
	uint public minScore;	// minimum accepting score 
	uint public level;		// risk manager level
	uint public cases; 		// number of cases per member
	function accept(regaMember _member) public constant returns(bool _accept, pool _pool) {
	    if(_member.score()>=minScore) {
	        return(true,pool(this));
	    }
	    return(false,pool(0));
	}
}
contract pool is riskManager, poolAccounts {
    bytes32 public name;
    poolMember[] public members;
	function insert(poolMember _member) public {
		members.push(_member);
	    _member.setParent(this);
	}
	function isMember(address _member) public constant returns(bool) {
	    bool result = false;
	    for(uint i=0; i<members.length; i++) {
	        if(members[i]==_member) return true;
	    }
	    return result;
	}
	function update(int _number, int _case) {
        poolAccounts.update(_number,_case);
        if(getBalance(an._number)!=0) {risk=uint(getBalance(an._cases) * 100000 / getBalance(an._number));}
    }
	function getPool(uint _level) public constant returns(pool _pool) {
		if(_level == level) return pool(this);
	    return pool(0);
	}
	function lendingCheck(int _loan, poolMember _member) public constant returns(bool) {
		if(this.balance < uint(_loan) || msg.sender != owner || !_member.checkLimit(_loan) || _member.getPool(level) != pool(this)) return false;
		return true;
	}
	function lend(int _loan, poolMember _member) public {
		if(!lendingCheck(_loan,_member)) throw;
		_member.loan(_loan);
	}
	function loan(int _amount, uint _level) public {
		poolAccounts.posting(an._10_loan, an._01_reserve, _amount);
	}
}
contract poolOfPools is pool {
	function insert(poolMember _member) public {
	    return;
	}
    function push(pool _pool) public {
		members.push(poolMember(_pool));
		poolMember(_pool).setParent(this);
	}
	function isMember(address _member) public constant returns(bool) {
	    for(uint i=0; i<members.length; i++) {
	        if(pool(members[i]).isMember(_member))
	            return true;
	    }
	    return false;
	}
	function accept(regaMember _member) public constant returns(bool _accept, pool _pool) {
	    (_accept, _pool) = riskManager.accept(_member);
	    if(!_accept) return(false,pool(0));
	    for(uint i=0; i<members.length; i++) {
	        (_accept, _pool) = pool(members[i]).accept(_member);
	        if(_accept) {
	            return(_accept, _pool);
	        }
	    }
	    return(false,pool(0));
	}
}
contract regaSuperPool is poolOfPools {
    function regaSuperPool(uint _minScore, address _owner) {risk=0; level=0; minScore=_minScore; name="SuperPool"; owner=_owner;}   
}
contract regaPool is poolOfPools, poolMember {
    function regaPool(uint _minScore, address _owner) {risk=0; level=1; minScore=_minScore; name="Pool"; owner=_owner;}
    function getPool(uint _level) public constant returns(pool _pool) {
		if(_level == level) return pool(this);
	    return parent.getPool(_level);
	}
    function loan(int _amount, uint _level) public {
		poolAccounts.posting(an._10_loan, an._01_reserve, _amount);
		if(_level < level) parent.loan(_amount,_level);
	}
}
contract regaSubPool is pool, poolMember {
    function regaSubPool(uint _minScore, address _owner, uint _cases) {risk=0; level=2; minScore=_minScore; name="SubPool"; owner=_owner; cases=_cases;}
    function getPool(uint _level) public constant returns(pool _pool) {
		if(_level == level) return pool(this);
	    return parent.getPool(_level);
	}
    function loan(int _amount, uint _level) public {
		poolAccounts.posting(an._10_loan, an._01_reserve, _amount);
		if(_level < level) parent.loan(_amount,_level);
	}
    function insert(poolMember _member) public {
		members.push(_member);
	    _member.setParent(this);
	    pool p_0 = getPool(0);			// super pool
        pool p_1 = getPool(1);			// pool
    	p_0.update(1, 0);
    	p_1.update(1, 0);
	}
}
contract regaMember is poolMember {
    uint public score;
    address public provider;
    bool public approved;
    function regaMember(uint _score, int _limit, address _owner) {
        score = _score;
        owner = _owner;
        limit = _limit;
    }
    /*
     *	Super Pool (15%) -- owner (15%)
     *			|
     * 			Pools (9%)
     * 				|
     * 				Sub Pools (61%)
     * 						|
     * 						Members.invest (100%)
     * 
    */
    function invest(int _amount) public {
        if(this.balance < uint(_amount) || msg.sender != owner) throw;
        int amount_2 = _amount * 61 / 100;
        int amount_1 = _amount * 9 / 100; 
        int amount_0 = _amount * 15 / 100;
        posting(an._11_cash, an._01_reserve, amount_2);
        posting(an._11_cash, an._02_contribution, amount_1);
        posting(an._11_cash, an._03_commission, amount_0);
        posting(an._11_cash, an._04_super_pool, amount_0);
        pool p_0 = getPool(0);			// super pool
        pool p_1 = getPool(1);			// pool
        pool p_2 = getPool(2);			// sub-pool
        address o_0 = p_0.owner(); 		// super pool owner
        if(p_0 != pool(0) && p_1 != pool(0) && p_2 != pool(0) && o_0 != address(0)) {
            if(!o_0.send(uint(amount_0)))
                throw;	                // commission to super pool owner
            if(!p_0.send(uint(amount_0)))
                throw;	                // contribution to super pool
            if(!p_1.send(uint(amount_1)))
                throw;	                // contribution to pool
            if(!p_2.send(uint(amount_2)))
                throw;	                // reserve to sub-pool
        }
    }
    function ask4Loan(int _loan) public constant returns(bool _accept, pool _pool) {
    	// check limit first
    	if(!checkLimit(_loan)) return(false,pool(0));
    	// find the pool that can issue the loan
    	pool p_0 = getPool(0);		// super pool
        pool p_1 = getPool(1);		// pool
        pool p_2 = getPool(2);		// sub-pool
        if(p_2.balance >= uint(_loan)) {
        	return(true, p_2);		// sub-pool can issue the loan
        }
        else if(p_1.balance >= uint(_loan)) {
        	return(true, p_1);		// pool can issue the loan
        }
        else if(p_0.balance >= uint(_loan)) {
        	return(true, p_0);		// super pool can issue the loan
        }
        return(false,pool(0));		// rejected
    }
    function acceptCase(int _cost) public constant returns(bool _accept, pool _pool) {
    	if(uint(getBalance(an._cases)) >= parent.cases()) return(false,pool(0));
    	return ask4Loan(_cost);
    }
    function submitCase(int _cost) public returns(bool _accept, pool _pool) {
    	if(msg.sender != owner) return(false,pool(0));
    	(_accept, _pool) = acceptCase(_cost);
    	if(!_accept) return(false,pool(0));
    	pool p_0 = getPool(0);		// super pool
        pool p_1 = getPool(1);		// pool
        pool p_2 = getPool(2);		// sub-pool
    	p_0.update(0, 1);
    	p_1.update(0, 1);
    	p_2.update(0, 1);
    	return(_accept, _pool);
    }
    function setProvider(address _provider) public {
    	pool p_0 = getPool(0);		// super pool
    	if(msg.sender != p_0.owner()) throw;
    	provider = _provider;
    }
    function approveProvider() public {
    	pool p_1 = getPool(1);		// pool
    	if(provider == address(0) || msg.sender != p_1.owner()) throw;
    	approved = true;
    }
    function pay2Provider() public {
    	uint _amount = this.balance;
    	int _reserve = getBalance(an._01_reserve);
    	if(provider == address(0) || !approved || msg.sender != owner || _amount == 0 || uint(_reserve) < _amount || uint(limit) < _amount ) throw;
    	posting(an._01_reserve, an._06_payments, int(_amount));
        if(!provider.send(_amount))
            throw;
        provider = address(0);
        approved = false;
    }
}
contract prm_pool is regaSubPool {
	function prm_pool(uint _minScore, address _owner, uint _cases) {
		risk = 0; level = 2; minScore = _minScore; name = "prm_pool"; owner = _owner; cases = _cases;
	}
}
contract prm_memer is regaMember {

    mapping(address => bytes32) public petId;
	bool public approvedByOwner;
	uint public approvedByMembersCount;
	uint public fraudWarningCount;

    function prm_member(uint _score, int _limit, address _owner, bytes32 _petId) {
        score = _score; owner = _owner; limit = _limit; 
		
		petId[_owner] 			= _petId;
		approvedByOwner			= false;
		approvedByMembersCount 	= 0;
		fraudWarningCount 		= 0;
    }

    function submitCase(int _cost, bytes32[] _rowId) public returns(bool _accept, pool _pool) {
        // member need to deposit at least 20% of _cost on contract account
        if(this.balance < uint(_cost * 20 / 100) || msg.sender != owner) 
            throw;
		if(petId[owner] != keccak256(_rowId))
			throw;
        return super.submitCase(_cost);
    }

	function ownerApproved() public {
    	if(msg.sender != owner) 
			throw;
    	approvedByOwner = true;
    }

    function paymentRequest(bytes32 _petId) public {
        if(msg.sender != provider)
            throw;
        petId[provider] = _petId;
    }

	function memberApproved(bytes32[] _rowId, bool _fraud) public {
		if(msg.sender == owner || msg.sender == provider)
			throw;
		
		pool p_0 = getPool(0);		// super pool
		
		if(!p_0.isMember(msg.sender))
			throw;
		
		if(petId[provider] != keccak256(_rowId))
			throw;
		
		if(_fraud)
			fraudWarningCount++;
		else
			approvedByMembersCount++;
	}

	 function pay2Provider() public {
		if(approvedByOwner && approvedByMembersCount > 3 &&  fraudWarningCount < 2) {
			// need more that 3 approvals and 0 or 1 fraud warning
		 	uint _amount = this.balance;
    		int _reserve = getBalance(an._01_reserve);

			pool p_0 = getPool(0);		// super pool
    		
			if(provider == address(0) || !approved || msg.sender != p_0.owner() || _amount == 0 || uint(_reserve) < _amount || uint(limit) < _amount ) 
				throw;
    		
			posting(an._01_reserve, an._06_payments, int(_amount));
        	
			if(!provider.send(_amount))
            	throw;
        	
			provider = address(0);
        	approved = false;
			approvedByMembersCount 	= 0;
			fraudWarningCount 		= 0;
		}
		else {
			throw;
		}
	 }
}