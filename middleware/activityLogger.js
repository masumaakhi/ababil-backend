const logAdminActivity = (db) => {
  return async (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const originalSend = res.send;
      res.send = function (data) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const adminId = req.admin ? req.admin.id : null;
          if (adminId) {
            let action = req.method;
            if (action === 'POST') action = 'CREATE';
            if (action === 'PUT' || action === 'PATCH') action = 'UPDATE';
            
            const urlParts = req.originalUrl.split('/');
            const entity = urlParts[3] || 'system'; // /api/admin/{entity}
            
            let details = `Endpoint: ${req.originalUrl}`;
            
            // Try to extract useful info from body or params
            if (req.body && Object.keys(req.body).length > 0) {
              const safeBody = { ...req.body };
              delete safeBody.password;
              details += ` | Data: ${JSON.stringify(safeBody).substring(0, 100)}`;
            }

            db.query('INSERT INTO admin_activity_logs (admin_id, action, entity, details) VALUES (?, ?, ?, ?)', 
              [adminId, action, entity, details]
            ).catch(err => console.error('Error logging activity:', err));
          }
        }
        originalSend.apply(res, arguments);
      };
    }
    next();
  };
};

module.exports = logAdminActivity;
