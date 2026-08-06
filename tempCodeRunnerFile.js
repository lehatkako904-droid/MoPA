
// ============================
//  ڕاگەیاندنی سەرڤەر
// ============================
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 Database: ${path.join(__dirname, 'database.sqlite')}`);
});