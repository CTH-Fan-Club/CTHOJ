// The production worker is designed to run as a separate BullMQ consumer.
// The development server owns a small in-process queue so the MVP works without Redis.
console.log('CTHOJ Judge Worker is ready. Configure Redis/BullMQ for production execution.');
