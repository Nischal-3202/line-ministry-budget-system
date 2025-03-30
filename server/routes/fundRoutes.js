const express = require('express');
const router = express.Router();
const db = require('../db');
const verifyToken = require('../middleware/authMiddleware');

router.post('/request', verifyToken, (req, res) => {
  if (req.user.role !== 3) {
    return res.status(403).json({ message: 'Only Office users can request funds' });
  }

  const { office_id, amount, purpose, fiscal_year, heading } = req.body;

  if (!office_id || !amount || !purpose || !fiscal_year || !heading) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  db.query(
    'INSERT INTO fund_requests (office_id, amount, purpose, fiscal_year, heading) VALUES (?, ?, ?, ?, ?)',
    [office_id, amount, purpose, fiscal_year, heading],
    (err, result) => {
      if (err) return res.status(500).json({ message: 'DB error' });
      res.status(201).json({ message: 'Fund request submitted', request_id: result.insertId });
    }
  );
});

router.get('/pending', verifyToken, (req, res) => {
  if (req.user.role !== 1) {
    return res.status(403).json({ message: 'Only Admins can view pending requests' });
  }

  db.query(
    `SELECT fr.*, o.name AS office_name, o.location
     FROM fund_requests fr
     JOIN offices o ON fr.office_id = o.id
     WHERE fr.status = 'pending'`,
    (err, results) => {
      if (err) return res.status(500).json({ message: 'DB error' });
      res.json(results);
    }
  );
});


router.post('/approve/:id', verifyToken, (req, res) => {
  if (req.user.role !== 1) {
    return res.status(403).json({ message: 'Only Admins can approve requests' });
  }

  const requestId = req.params.id;

  db.query(
    'UPDATE fund_requests SET status = "approved" WHERE id = ?',
    [requestId],
    (err, result) => {
      if (err) return res.status(500).json({ message: 'DB error during approval' });

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Fund request not found' });
      }

      res.json({ message: '✅ Fund request approved', request_id: requestId });
    }
  );
});


router.post('/reject/:id', verifyToken, (req, res) => {
  if (req.user.role !== 1) {
    return res.status(403).json({ message: 'Only Admins can reject requests' });
  }

  const requestId = req.params.id;

  db.query(
    'UPDATE fund_requests SET status = "rejected" WHERE id = ?',
    [requestId],
    (err, result) => {
      if (err) return res.status(500).json({ message: 'DB error during rejection' });

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Fund request not found' });
      }

      res.json({ message: '❌ Fund request rejected', request_id: requestId });
    }
  );
});

// 🟢 GET approved fund requests
router.get('/approved', verifyToken, (req, res) => {
  if (req.user.role !== 1) {
    return res.status(403).json({ message: 'Only Admins can view approved requests' });
  }

  db.query(
    `SELECT fr.*, o.name AS office_name, o.location
     FROM fund_requests fr
     JOIN offices o ON fr.office_id = o.id
     WHERE fr.status = 'approved'`,
    (err, results) => {
      if (err) return res.status(500).json({ message: 'DB error' });
      res.json(results);
    }
  );
});

// 🔴 GET rejected fund requests
router.get('/rejected', verifyToken, (req, res) => {
  if (req.user.role !== 1) {
    return res.status(403).json({ message: 'Only Admins can view rejected requests' });
  }

  db.query(
    `SELECT fr.*, o.name AS office_name, o.location
     FROM fund_requests fr
     JOIN offices o ON fr.office_id = o.id
     WHERE fr.status = 'rejected'`,
    (err, results) => {
      if (err) return res.status(500).json({ message: 'DB error' });
      res.json(results);
    }
  );
});

// 💸 Log fund transfer after approval
router.post('/transfer/:id', verifyToken, (req, res) => {
  if (req.user.role !== 1) {
    return res.status(403).json({ message: 'Only Admins can perform fund transfers' });
  }

  const requestId = req.params.id;

  // Step 1: Fetch approved fund request
  db.query(
    'SELECT * FROM fund_requests WHERE id = ? AND status = "approved"',
    [requestId],
    (err, requests) => {
      if (err) return res.status(500).json({ message: 'DB error finding request' });
      if (requests.length === 0) {
        return res.status(404).json({ message: 'Approved fund request not found' });
      }

      const { office_id, amount, fiscal_year, heading } = requests[0];

      // Step 2: Get ministry from office
      db.query(
        'SELECT ministry_id FROM offices WHERE id = ?',
        [office_id],
        (err, offices) => {
          if (err) return res.status(500).json({ message: 'DB error finding office ministry' });

          const { ministry_id } = offices[0];

          // Step 2.5: Check if ministry has enough budget
          db.query(
            'SELECT amount FROM budgets WHERE ministry_id = ? AND fiscal_year = ?',
            [ministry_id, fiscal_year],
            (err, budgetRows) => {
              if (err) return res.status(500).json({ message: 'DB error checking ministry budget' });

              if (budgetRows.length === 0 || parseFloat(budgetRows[0].amount) < amount) {
                return res.status(400).json({ message: '❌ Transfer failed: Insufficient budget for ministry' });
              }

              // Continue with Step 3: Insert into fund_transfers
              db.query(
                'INSERT INTO fund_transfers (fund_request_id, office_id, ministry_id, amount) VALUES (?, ?, ?, ?)',
                [requestId, office_id, ministry_id, amount],
                (err, result) => {
                  if (err) return res.status(500).json({ message: 'Transfer log failed' });

                  // Step 4: Deduct amount from ministry budget
                  db.query(
                    `UPDATE budgets 
                     SET amount = amount - ? 
                     WHERE ministry_id = ? AND fiscal_year = ?`,
                    [amount, ministry_id, fiscal_year],
                    (err, budgetResult) => {
                      if (err) {
                        return res.status(500).json({
                          message: 'Transfer logged, but budget update failed',
                          transfer_id: result.insertId
                        });
                      }

                      db.query(
                        `INSERT INTO office_funds (office_id, heading, fiscal_year, balance)
                         VALUES (?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)`,
                        [office_id, heading, fiscal_year, amount],
                        (err, fundResult) => {
                          if (err) {
                            return res.status(500).json({
                              message: 'Budget updated, but office fund credit failed',
                              transfer_id: result.insertId
                            });
                          }

                          res.status(201).json({
                            message: '✅ Fund transfer logged, budget deducted & office fund credited',
                            transfer_id: result.insertId
                          });
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  );
});

// 🧾 View remaining budget for a ministry by fiscal year
router.get('/budget/:ministry_id/:fiscal_year', verifyToken, (req, res) => {
  if (req.user.role !== 1) {
    return res.status(403).json({ message: 'Only Admins can view ministry budgets' });
  }

  const { ministry_id, fiscal_year } = req.params;

  db.query(
    'SELECT amount FROM budgets WHERE ministry_id = ? AND fiscal_year = ?',
    [ministry_id, fiscal_year],
    (err, results) => {
      if (err) return res.status(500).json({ message: 'DB error while fetching budget' });

      if (results.length === 0) {
        return res.status(404).json({ message: 'No budget found for this ministry and fiscal year' });
      }

      res.json({
        ministry_id: parseInt(ministry_id),
        fiscal_year,
        remaining_budget: results[0].amount
      });
    }
  );
});

// 💼 View office funds by heading and fiscal year
router.get('/office-funds/:office_id/:fiscal_year', verifyToken, (req, res) => {
  if (req.user.role !== 1 && req.user.role !== 3) {
    return res.status(403).json({ message: 'Only Admins or Office users can view office funds' });
  }

  const { office_id, fiscal_year } = req.params;

  db.query(
    `SELECT heading, balance 
     FROM office_funds 
     WHERE office_id = ? AND fiscal_year = ?`,
    [office_id, fiscal_year],
    (err, results) => {
      if (err) return res.status(500).json({ message: 'DB error while fetching office funds' });

      if (results.length === 0) {
        return res.status(404).json({ message: 'No funds found for this office and fiscal year' });
      }

      res.json(results);
    }
  );
});

// 💸 Office spends from fund under a heading
router.post('/spend', verifyToken, (req, res) => {
  if (req.user.role !== 3) {
    return res.status(403).json({ message: 'Only Office users can spend funds' });
  }

  const { office_id, heading, fiscal_year, amount, description } = req.body;

  if (!office_id || !heading || !fiscal_year || !amount || !description) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  // Step 1: Check available balance
  db.query(
    `SELECT balance FROM office_funds 
     WHERE office_id = ? AND heading = ? AND fiscal_year = ?`,
    [office_id, heading, fiscal_year],
    (err, results) => {
      if (err) return res.status(500).json({ message: 'DB error while checking balance' });

      if (results.length === 0 || parseFloat(results[0].balance) < amount) {
        return res.status(400).json({ message: 'Insufficient funds under this heading' });
      }

      // Step 2: Deduct amount from office_funds
      db.query(
        `UPDATE office_funds 
         SET balance = balance - ? 
         WHERE office_id = ? AND heading = ? AND fiscal_year = ?`,
        [amount, office_id, heading, fiscal_year],
        (err, updateResult) => {
          if (err) return res.status(500).json({ message: 'Error deducting fund' });

          // Step 3: Log the expenditure
          db.query(
            `INSERT INTO office_expenditures (office_id, heading, fiscal_year, amount, description)
             VALUES (?, ?, ?, ?, ?)`,
            [office_id, heading, fiscal_year, amount, description],
            (err, logResult) => {
              if (err) return res.status(500).json({ message: 'Error logging expenditure' });

              res.status(201).json({
                message: '✅ Expenditure recorded and fund updated',
                expenditure_id: logResult.insertId
              });
            }
          );
        }
      );
    }
  );
});

// 🤖 Auto-request salary fund for all employees in an office for a given month
router.post('/salaries/request-monthly', verifyToken, (req, res) => {
  if (req.user.role !== 3) {
    return res.status(403).json({ message: 'Only Office users can request salary fund' });
  }

  const { office_id, fiscal_year, month } = req.body;

  if (!office_id || !fiscal_year || !month) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  // Step 1: Get total salary required for the office
  db.query(
    `SELECT SUM(et.monthly_salary) AS total_salary
     FROM employees e
     JOIN employee_tiers et ON e.tier_id = et.id
     WHERE e.office_id = ?`,
    [office_id],
    (err, results) => {
      if (err) return res.status(500).json({ message: 'DB error calculating salary' });

      const totalSalary = results[0].total_salary;
      if (!totalSalary || totalSalary <= 0) {
        return res.status(400).json({ message: 'No employees found for this office' });
      }

      // Step 2: Check if a similar fund request already exists
      const purpose = `Monthly Salary for ${month}`;
      const heading = 'Salaries';

      db.query(
        `SELECT * FROM fund_requests 
         WHERE office_id = ? AND purpose = ? AND heading = ? AND fiscal_year = ?`,
        [office_id, purpose, heading, fiscal_year],
        (err, existing) => {
          if (err) return res.status(500).json({ message: 'DB error checking existing request' });

          if (existing.length > 0) {
            return res.status(400).json({ message: 'Salary fund request already exists for this month' });
          }

          // Step 3: Insert new fund request
          db.query(
            `INSERT INTO fund_requests (office_id, amount, purpose, fiscal_year, heading)
             VALUES (?, ?, ?, ?, ?)`,
            [office_id, totalSalary, purpose, fiscal_year, heading],
            (err, result) => {
              if (err) return res.status(500).json({ message: 'DB error inserting fund request' });

              res.status(201).json({
                message: '✅ Salary fund request generated successfully',
                request_id: result.insertId,
                amount: totalSalary
              });
            }
          );
        }
      );
    }
  );
});

// ✅ Bulk approve all pending fund requests
router.post('/approve-all', verifyToken, (req, res) => {
  if (req.user.role !== 1) {
    return res.status(403).json({ message: 'Only Admins can bulk approve requests' });
  }

  db.query(
    'UPDATE fund_requests SET status = "approved" WHERE status = "pending"',
    (err, result) => {
      if (err) return res.status(500).json({ message: 'DB error during bulk approval' });

      res.status(200).json({
        message: `✅ ${result.affectedRows} pending request(s) approved`
      });
    }
  );
});

// 📈 Generate report of fund transfers as CSV
const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');

router.get('/reports/fund-transfers', verifyToken, (req, res) => {
  if (req.user.role !== 1) {
    return res.status(403).json({ message: 'Only Admins can generate reports' });
  }

  db.query(
    `SELECT ft.id, ft.amount, ft.transfer_date, o.name AS office_name, m.name AS ministry_name
     FROM fund_transfers ft
     JOIN offices o ON ft.office_id = o.id
     JOIN ministries m ON ft.ministry_id = m.id`,
    (err, results) => {
      if (err) return res.status(500).json({ message: 'DB error generating report' });

      const fields = ['id', 'amount', 'transfer_date', 'office_name', 'ministry_name'];
      const opts = { fields };

      try {
        const parser = new Parser(opts);
        const csv = parser.parse(results);
        const filePath = path.join(__dirname, '../exports/fund_transfers_report.csv');

        fs.writeFileSync(filePath, csv);

        res.download(filePath, 'fund_transfers_report.csv');
      } catch (err) {
        res.status(500).json({ message: 'Error generating CSV' });
      }
    }
  );
});

// 📊 Export office incoming (funds received) vs outgoing (expenses) as CSV
router.get('/reports/office-activity/:office_id/:fiscal_year', verifyToken, (req, res) => {
  if (req.user.role !== 1) {
    return res.status(403).json({ message: 'Only Admins can generate office activity reports' });
  }
 
  const { office_id, fiscal_year } = req.params;
 
  const query = `
    SELECT h.heading,
      IFNULL(f.balance, 0) AS total_received,
      IFNULL(SUM(e.amount), 0) AS total_spent
    FROM (
      SELECT DISTINCT heading FROM office_funds WHERE office_id = ? AND fiscal_year = ?
    ) h
    LEFT JOIN office_funds f ON f.office_id = ? AND f.fiscal_year = ? AND f.heading = h.heading
    LEFT JOIN office_expenditures e ON e.office_id = ? AND e.fiscal_year = ? AND e.heading = h.heading
    GROUP BY h.heading
  `;
 
  db.query(query, [office_id, fiscal_year, office_id, fiscal_year, office_id, fiscal_year], (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error generating activity report' });
 
    const fields = ['heading', 'total_received', 'total_spent'];
    const { Parser } = require('json2csv');
    const parser = new Parser({ fields });
 
    try {
      const csv = parser.parse(results);
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, `../exports/office_activity_report_${office_id}_${fiscal_year}.csv`);
 
      fs.writeFileSync(filePath, csv);
      res.download(filePath, `office_activity_report_${office_id}_${fiscal_year}.csv`);
    } catch (err) {
      res.status(500).json({ message: 'Error generating CSV activity report' });
    }
  });
});
module.exports = router;