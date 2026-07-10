const createNotification = async (db, title, message, type = 'system') => {
  try {
    await db.execute(
      'INSERT INTO admin_notifications (title, message, type) VALUES (?, ?, ?)',
      [title, message, type]
    );
  } catch (error) {
    console.error('Failed to create admin notification:', error);
  }
};

module.exports = {
  createNotification
};
