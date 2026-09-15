#include <sqlite3.h>
#include <string>
#include <windows.h>

static sqlite3* g_db = nullptr;


static std::string GetClipsDbPath()
{
    wchar_t exePath[MAX_PATH];
    GetModuleFileNameW(nullptr, exePath, MAX_PATH);
    std::wstring path(exePath);
    path = path.substr(0, path.find_last_of(L"\\/"));
    path += L"\\..\\..\\clips.db";

    int size = WideCharToMultiByte(CP_UTF8, 0, path.c_str(), -1, nullptr, 0, nullptr, nullptr);
    std::string out(size - 1, '\0');
    WideCharToMultiByte(CP_UTF8, 0, path.c_str(), -1, out.data(), size, nullptr, nullptr);
    return out;
}

bool InitDatabase()
{
    const std::string dbPath = GetClipsDbPath();

    OutputDebugStringA(("cliphistory: using database: " + dbPath + "\n").c_str());

    if (sqlite3_open(dbPath.c_str(), &g_db) != SQLITE_OK)
        return false;

    sqlite3_exec(g_db,
            "CREATE TABLE IF NOT EXISTS clips ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "content TEXT NOT NULL, "
            "created_at TEXT NOT NULL,"
            "category TEXT,"
            "tag TEXT"
            ");",
        nullptr, nullptr, nullptr);
        return true;
}

void SaveClip(const std::string& content, const std::string& created_at)
{
    const char* sql =
        "INSERT INTO clips (content, created_at) VALUES (?, ?);";

    sqlite3_stmt* stmt = nullptr;

    sqlite3_prepare_v2(g_db, sql, -1, &stmt, nullptr);

    sqlite3_bind_text(stmt, 1, content.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, created_at.c_str(), -1, SQLITE_TRANSIENT);

    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
}

void DeleteClip(int id)
{
    std::string sql = "DELETE FROM clips WHERE id = " + std::to_string(id) + ";";
    sqlite3_exec(g_db, sql.c_str(), nullptr, nullptr, nullptr);
}

void shutdownDatabase()
{
    sqlite3_close(g_db);
    g_db = nullptr;
}