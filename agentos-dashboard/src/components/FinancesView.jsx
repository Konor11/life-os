import { useState } from 'react'
import { Icon } from './Icons'

const accountTypes = ['checking', 'savings', 'investment', 'crypto', 'credit', 'loan', 'other']
const transactionTypes = ['income', 'expense', 'transfer', 'investment', 'interest', 'fee']

export function FinancesView({ finances, onUpdate }) {
  const [showForm, setShowForm] = useState(false)
  const [activeTab, setActiveTab] = useState('accounts')
  const [newAccount, setNewAccount] = useState({ name: '', type: 'checking', balance: 0, currency: 'USD', institution: '' })
  const [newTransaction, setNewTransaction] = useState({ accountId: '', type: 'expense', amount: 0, category: '', description: '', date: new Date().toISOString().slice(0,10) })

  const totalBalance = finances.accounts.reduce((sum, a) => sum + a.balance, 0)
  const monthlyIncome = finances.transactions
    .filter(t => t.type === 'income' && t.date.startsWith(new Date().toISOString().slice(0,7)))
    .reduce((sum, t) => sum + t.amount, 0)
  const monthlyExpense = finances.transactions
    .filter(t => t.type === 'expense' && t.date.startsWith(new Date().toISOString().slice(0,7)))
    .reduce((sum, t) => sum + t.amount, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Finances</h1>
          <p className="text-text-muted">Accounts • Transactions • Budgets • Goals</p>
        </div>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors flex items-center gap-2">
          <Icon name="Plus" size={18} />
          Add
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Total Balance" value={`$${totalBalance.toLocaleString()}`} icon="Wallet" color="success" />
        <MetricCard label="Monthly Income" value={`$${monthlyIncome.toLocaleString()}`} icon="TrendingUp" color="success" />
        <MetricCard label="Monthly Expense" value={`$${monthlyExpense.toLocaleString()}`} icon="TrendingDown" color="danger" />
      </div>

      <div className="flex items-center gap-2 border-b border-border mb-4">
        {['accounts', 'transactions', 'budgets', 'goals'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text'}`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'accounts' && (
        <AccountList accounts={finances.accounts} onUpdate={onUpdate} />
      )}
      {activeTab === 'transactions' && (
        <TransactionList transactions={finances.transactions} accounts={finances.accounts} onUpdate={onUpdate} />
      )}
      {activeTab === 'budgets' && (
        <BudgetList budgets={finances.budgets} onUpdate={onUpdate} />
      )}
      {activeTab === 'goals' && (
        <GoalList goals={finances.goals} onUpdate={onUpdate} />
      )}

      {showForm && (
        <FinanceForm
          mode={activeTab === 'accounts' ? 'account' : activeTab === 'transactions' ? 'transaction' : activeTab === 'budgets' ? 'budget' : 'goal'}
          account={newAccount}
          transaction={newTransaction}
          accounts={finances.accounts}
          onAccountChange={setNewAccount}
          onTransactionChange={setNewTransaction}
          onSubmit={() => {
            if (activeTab === 'accounts' && newAccount.name) {
              const acc = { ...newAccount, id: `acc-${Date.now()}`, balance: parseFloat(newAccount.balance) || 0 }
              onUpdate({ ...finances, accounts: [acc, ...finances.accounts] })
              setNewAccount({ name: '', type: 'checking', balance: 0, currency: 'USD', institution: '' })
            } else if (activeTab === 'transactions' && newTransaction.accountId && newTransaction.amount) {
              const txn = { ...newTransaction, id: `txn-${Date.now()}`, amount: parseFloat(newTransaction.amount), date: newTransaction.date }
              onUpdate({ ...finances, transactions: [txn, ...finances.transactions] })
              setNewTransaction({ accountId: '', type: 'expense', amount: 0, category: '', description: '', date: new Date().toISOString().slice(0,10) })
            }
            setShowForm(false)
          }}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  )
}

function AccountList({ accounts, onUpdate }) {
  const handleUpdate = (id, updates) => onUpdate(f => ({ ...f, accounts: f.accounts.map(a => a.id === id ? { ...a, ...updates } : a) }))
  return (
    <div className="glass p-4 rounded-xl">
      {accounts.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Icon name="Wallet" size={48} className="mx-auto mb-4 opacity-30" />
          <p>No accounts yet. Click "Add" to create one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map(acc => (
            <AccountCard key={acc.id} account={acc} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}

function AccountCard({ account, onUpdate }) {
  return (
    <div className="glass p-4 rounded-lg hover:bg-bg-elevated/50 transition-colors group">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <Icon name={getAccountIcon(account.type)} size={20} className="text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-text">{account.name}</h3>
            <p className="text-xs text-text-muted capitalize">{account.type}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono font-bold text-xl text-text">${(account.balance || 0).toLocaleString()}</p>
          <p className="text-xs text-text-muted">{account.currency || 'USD'}</p>
        </div>
      </div>
      {account.institution && <p className="text-xs text-text-muted mb-3">{account.institution}</p>}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onUpdate(account.id, { balance: account.balance + 100 })} className="px-2 py-1 text-xs bg-success/10 text-success rounded hover:bg-success/20">+$100</button>
        <button onClick={() => onUpdate(account.id, { balance: account.balance - 50 })} className="px-2 py-1 text-xs bg-danger/10 text-danger rounded hover:bg-danger/20">-$50</button>
        <button className="p-1.5 rounded hover:bg-bg-elevated text-text-muted"><Icon name="Edit" size={14} /></button>
        <button className="p-1.5 rounded hover:bg-danger/10 text-danger"><Icon name="Trash2" size={14} /></button>
      </div>
    </div>
  )
}

function TransactionList({ transactions, accounts, onUpdate }) {
  return (
    <div className="glass p-4 rounded-xl">
      {transactions.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Icon name="Receipt" size={48} className="mx-auto mb-4 opacity-30" />
          <p>No transactions yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {transactions.slice(0, 20).map(txn => (
            <TransactionCard key={txn.id} transaction={txn} accounts={accounts} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}

function TransactionCard({ transaction, accounts, onUpdate }) {
  const account = accounts.find(a => a.id === transaction.accountId)
  const isIncome = transaction.type === 'income'
  return (
    <div className="glass p-3 rounded-lg hover:bg-bg-elevated/50 transition-colors group flex items-center justify-between">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className={`w-8 h-8 rounded-full flex items-center justify-center ${isIncome ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
          <Icon name={isIncome ? 'ArrowUpRight' : 'ArrowDownLeft'} size={16} />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-text truncate">{transaction.description || 'Transaction'}</p>
          <p className="text-xs text-text-muted flex items-center gap-2">
            {account && <span className="px-1.5 py-0.5 bg-bg-elevated rounded text-text-muted">{account.name}</span>}
            <span className="px-1.5 py-0.5 bg-border rounded text-text-muted capitalize">{transaction.type}</span>
            {transaction.category && <span className="px-1.5 py-0.5 bg-border rounded text-text-muted">{transaction.category}</span>}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className={`font-mono font-bold ${isIncome ? 'text-success' : 'text-danger'}`}>
          {isIncome ? '+' : '-'}${(transaction.amount || 0).toLocaleString()}
        </p>
        <p className="text-xs text-text-muted">{transaction.date}</p>
      </div>
    </div>
  )
}

function BudgetList({ budgets, onUpdate }) {
  return (
    <div className="glass p-4 rounded-xl">
      {budgets.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Icon name="Target" size={48} className="mx-auto mb-4 opacity-30" />
          <p>No budgets yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {budgets.map(b => (
            <div key={b.id} className="glass p-3 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-text">{b.name}</h4>
                <span className="text-xs px-2 py-0.5 bg-border rounded text-text-muted">{b.category}</span>
              </div>
              <div className="h-2 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${Math.min(100, (b.spent / b.limit) * 100)}%` }} />
              </div>
              <p className="text-xs text-text-muted mt-1">${b.spent.toLocaleString()} / ${b.limit.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GoalList({ goals, onUpdate }) {
  return (
    <div className="glass p-4 rounded-xl">
      {goals.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Icon name="Flag" size={48} className="mx-auto mb-4 opacity-30" />
          <p>No financial goals yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {goals.map(g => (
            <div key={g.id} className="glass p-3 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-text">{g.name}</h4>
                <span className="text-xs text-success font-bold">${g.current.toLocaleString()} / ${g.target.toLocaleString()}</span>
              </div>
              <div className="h-2 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-warning rounded-full transition-all" style={{ width: `${Math.min(100, (g.current / g.target) * 100)}%` }} />
              </div>
              <p className="text-xs text-text-muted mt-1">{g.deadline ? `Deadline: ${g.deadline}` : ''}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FinanceForm({ mode, account, transaction, accounts, onAccountChange, onTransactionChange, onSubmit, onCancel }) {
  if (mode === 'account') {
    return (
      <AccountForm account={account} onChange={onAccountChange} onSubmit={onSubmit} onCancel={onCancel} />
    )
  }
  if (mode === 'transaction') {
    return (
      <TransactionForm transaction={transaction} accounts={accounts} onChange={onTransactionChange} onSubmit={onSubmit} onCancel={onCancel} />
    )
  }
  return null
}

function AccountForm({ account, onChange, onSubmit, onCancel }) {
  return (
    <div className="glass p-4 rounded-xl space-y-4 border border-accent/30">
      <h3 className="font-semibold text-text">New Account</h3>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Name *</label>
            <input type="text" value={account.name} onChange={e => onChange({...account, name: e.target.value})} placeholder="Main Checking" className="input" autoFocus />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Type</label>
            <select value={account.type} onChange={e => onChange({...account, type: e.target.value})} className="input">
              {accountTypes.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Starting Balance</label>
            <input type="number" step="0.01" value={account.balance} onChange={e => onChange({...account, balance: e.target.value})} placeholder="0.00" className="input" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Currency</label>
            <input type="text" value={account.currency} onChange={e => onChange({...account, currency: e.target.value})} placeholder="USD" className="input" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Institution (optional)</label>
          <input type="text" value={account.institution} onChange={e => onChange({...account, institution: e.target.value})} placeholder="Chase, Vanguard, etc." className="input" />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated transition-colors">Cancel</button>
        <button onClick={onSubmit} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors" disabled={!account.name}>Create Account</button>
      </div>
    </div>
  )
}

function TransactionForm({ transaction, accounts, onChange, onSubmit, onCancel }) {
  return (
    <div className="glass p-4 rounded-xl space-y-4 border border-accent/30">
      <h3 className="font-semibold text-text">New Transaction</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-text-muted mb-1">Account *</label>
          <select value={transaction.accountId} onChange={e => onChange({...transaction, accountId: e.target.value})} className="input">
            <option value="">Select account</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name} (${a.balance.toLocaleString()})</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Type</label>
            <select value={transaction.type} onChange={e => onChange({...transaction, type: e.target.value})} className="input">
              {transactionTypes.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Amount *</label>
            <input type="number" step="0.01" value={transaction.amount} onChange={e => onChange({...transaction, amount: e.target.value})} placeholder="0.00" className="input" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Category</label>
            <input type="text" value={transaction.category} onChange={e => onChange({...transaction, category: e.target.value})} placeholder="Food, Transport, Salary..." className="input" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Date</label>
            <input type="date" value={transaction.date} onChange={e => onChange({...transaction, date: e.target.value})} className="input" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Description</label>
          <input type="text" value={transaction.description} onChange={e => onChange({...transaction, description: e.target.value})} placeholder="What was this for?" className="input" />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated transition-colors">Cancel</button>
        <button onClick={onSubmit} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors" disabled={!transaction.accountId || !transaction.amount}>Create Transaction</button>
      </div>
    </div>
  )
}

function MetricCard({ label, value, icon, color }) {
  return (
    <div className="glass p-4 rounded-xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-text mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl bg-${color}/10 flex items-center justify-center`}>
          <Icon name={icon} size={24} className={`text-${color}`} />
        </div>
      </div>
    </div>
  )
}

function getAccountIcon(type) {
  switch (type) {
    case 'checking': return 'Building'
    case 'savings': return 'PiggyBank'
    case 'investment': return 'TrendingUp'
    case 'crypto': return 'Bitcoin'
    case 'credit': return 'CreditCard'
    case 'loan': return 'FileText'
    default: return 'Wallet'
  }
}