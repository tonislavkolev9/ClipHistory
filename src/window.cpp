#include <windows.h>
#include <windowsx.h>
#include <wrl/client.h>
#include <wrl/event.h>
#include <WebView2.h>
#include <string>
#include <iostream>

#include "database.h"


#define WM_CLIPBOARDUPDATE              0x031D

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;

static bool LooksLikeInternalApiPayload(const std::string& content)
{
    size_t start = content.find_first_not_of(" \t\r\n");
    if (start == std::string::npos)
        return false;
    size_t end = content.find_last_not_of(" \t\r\n");
    std::string trimmed = content.substr(start, end - start + 1);

    if (trimmed.size() < 2 || trimmed.front() != '{' || trimmed.back() != '}')
        return false;

    bool looksLikeSearchRequest = trimmed.find("\"query\"") != std::string::npos;

    bool looksLikeSearchResponse = trimmed.find("\"results\"") != std::string::npos;

    bool looksLikeTagRequest = trimmed.find("\"content\"") != std::string::npos
                            && trimmed.find("\"created_at\"") != std::string::npos;

    return looksLikeSearchRequest || looksLikeSearchResponse || looksLikeTagRequest;
}

LRESULT CALLBACK WindowProc(HWND, UINT, WPARAM, LPARAM);

static ComPtr<ICoreWebView2Controller> g_webviewController;
static ComPtr<ICoreWebView2> g_webview;
static bool g_ignoreNextClipboardUpdate = false;
static bool g_captureEnabled = true;


static RECT GetWebviewBounds(HWND hwnd)
{
    RECT bounds;
    GetClientRect(hwnd, &bounds);
    const int dpi = GetDpiForWindow(hwnd);
    const int inset = MulDiv(6, dpi, 96);
    bounds.left += inset;
    bounds.top += inset;
    bounds.right -= inset;
    bounds.bottom -= inset;
    return bounds;
}

int RunWindow() {

    HINSTANCE hInstance = GetModuleHandle(nullptr);
    int nCmdShow = SW_SHOW;

    const wchar_t CLASS_NAME[] = L"MyWindowClass";

    WNDCLASS wc = {};

    wc.lpfnWndProc = WindowProc;
    wc.hInstance = hInstance;
    wc.lpszClassName = CLASS_NAME;
    wc.hbrBackground = CreateSolidBrush(RGB(0xf2, 0xf2, 0xf4));

    RegisterClass(&wc);

    HWND hwnd = CreateWindowEx(
        0,
        CLASS_NAME,
        L"My Window",
        WS_POPUP | WS_THICKFRAME | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX,
        CW_USEDEFAULT,
        CW_USEDEFAULT,
        800,
        600,
        nullptr,
        nullptr,
        hInstance,
        nullptr
    );

    ShowWindow(hwnd, nCmdShow);
    UpdateWindow(hwnd);

    SetWindowPos(hwnd, nullptr, 0, 0, 0, 0,
        SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);

    AddClipboardFormatListener(hwnd);

    CreateCoreWebView2EnvironmentWithOptions(
        nullptr,
        nullptr,
        nullptr,
        Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
            [hwnd](HRESULT result, ICoreWebView2Environment* env) -> HRESULT
            {
                if (FAILED(result))
                    return result;

                env->CreateCoreWebView2Controller(
                    hwnd,
                    Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                        [hwnd](HRESULT result, ICoreWebView2Controller* controller) -> HRESULT
                        {
                            if (FAILED(result) || controller == nullptr)
                                return result;

                            g_webviewController = controller;

                            ComPtr<ICoreWebView2> webview;
                            g_webviewController->get_CoreWebView2(&webview);
                            g_webview = webview;

                            HWND owner;
                            g_webviewController->get_ParentWindow(&owner);
                            g_webviewController->put_Bounds(GetWebviewBounds(owner));

                            wchar_t exePath[MAX_PATH];
                            GetModuleFileNameW(nullptr, exePath, MAX_PATH);
                            std::wstring path(exePath);
                            path = path.substr(0, path.find_last_of(L"\\/"));
                            path += L"\\..\\..\\src\\ui";

                            ComPtr<ICoreWebView2_3> webview3;
                            webview.As(&webview3);
                            if (webview3)
                            {
                                webview3->SetVirtualHostNameToFolderMapping(
                                    L"app.local",
                                    path.c_str(),
                                    COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW);
                            }

                            webview->Navigate(L"https://app.local/index.html");
                            static EventRegistrationToken webMessageToken;
                            webview->add_WebMessageReceived(
                                Callback<ICoreWebView2WebMessageReceivedEventHandler>(
                                    [hwnd](ICoreWebView2* sender, ICoreWebView2WebMessageReceivedEventArgs* args) -> HRESULT
                                    {
                                        LPWSTR message = nullptr;
                                        args->TryGetWebMessageAsString(&message);
                                        if (message)
                                        {
                                            std::wstring msg(message);

                                            if (msg == L"minimize")
                                            {
                                                ShowWindow(hwnd, SW_MINIMIZE);
                                            }
                                            else if (msg == L"maximize")
                                            {
                                                ShowWindow(hwnd, IsZoomed(hwnd) ? SW_RESTORE : SW_MAXIMIZE);
                                            }
                                            else if (msg == L"close")
                                            {
                                                PostMessage(hwnd, WM_CLOSE, 0, 0);
                                            } 
                                            else if (msg == L"drag")
                                            {
                                                ReleaseCapture();
                                                SendMessage(hwnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
                                            }
                                            else if (msg == L"internal-copy")
                                            {
                                                g_ignoreNextClipboardUpdate = true;
                                            }
                                            else if (msg == L"capture-off")
                                            {
                                                g_captureEnabled = false;
                                            }
                                            else if (msg == L"capture-on")
                                            {
                                                g_captureEnabled = true;
                                            }
                                            
                                            CoTaskMemFree(message);
                                        }
                                        return S_OK;
                                    }).Get(),
                                &webMessageToken);


                            return S_OK;
                        }).Get());
                

                return S_OK;
            }).Get());

    if (!InitDatabase())
    {
        OutputDebugStringA("cliphistory: FAILED to open/create clips.db — clips will not persist this session\n");
    }

    MSG msg = {};

    while (GetMessage(&msg, nullptr, 0, 0))
    {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }

    return (int)msg.wParam;
}


LRESULT CALLBACK WindowProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
    switch (msg)
    {
    
    case WM_ERASEBKGND:
    {
        HDC hdc = reinterpret_cast<HDC>(wParam);
        RECT rc;
        GetClientRect(hwnd, &rc);
        HBRUSH brush = CreateSolidBrush(RGB(0xf2, 0xf2, 0xf4));
        FillRect(hdc, &rc, brush);
        DeleteObject(brush);
        return 1;
    }

    case WM_GETMINMAXINFO:
    {
        const int dpi = GetDpiForWindow(hwnd);
        MINMAXINFO* mmi = reinterpret_cast<MINMAXINFO*>(lParam);
        mmi->ptMinTrackSize.x = MulDiv(820, dpi, 96);
        mmi->ptMinTrackSize.y = MulDiv(480, dpi, 96);
        return 0;
    }

    case WM_NCCALCSIZE:
        if (wParam)
            return 0;
        return DefWindowProc(hwnd, msg, wParam, lParam);

    case WM_NCHITTEST:
    {
        const int dpi = GetDpiForWindow(hwnd);
        const int edge = MulDiv(14, dpi, 96);
        const int corner = MulDiv(28, dpi, 96);

        RECT rc;
        GetWindowRect(hwnd, &rc);
        int x = GET_X_LPARAM(lParam);
        int y = GET_Y_LPARAM(lParam);

        bool leftEdge   = x < rc.left + edge;
        bool rightEdge  = x >= rc.right - edge;
        bool topEdge    = y < rc.top + edge;
        bool bottomEdge = y >= rc.bottom - edge;

        bool leftCorner   = x < rc.left + corner;
        bool rightCorner  = x >= rc.right - corner;
        bool topCorner    = y < rc.top + corner;
        bool bottomCorner = y >= rc.bottom - corner;

        if (topCorner && leftCorner)     return HTTOPLEFT;
        if (topCorner && rightCorner)    return HTTOPRIGHT;
        if (bottomCorner && leftCorner)  return HTBOTTOMLEFT;
        if (bottomCorner && rightCorner) return HTBOTTOMRIGHT;
        if (leftEdge)                    return HTLEFT;
        if (rightEdge)                   return HTRIGHT;
        if (topEdge)                     return HTTOP;
        if (bottomEdge)                  return HTBOTTOM;

        return HTCLIENT;
    }

    case WM_SIZE:
        if (g_webviewController != nullptr)
        {
            g_webviewController->put_Bounds(GetWebviewBounds(hwnd));
        }
        return 0;
    

    case WM_DESTROY:

        shutdownDatabase();
        PostQuitMessage(0);
        return 0;

    case WM_CLIPBOARDUPDATE:
{

        if (g_ignoreNextClipboardUpdate)
    {
        g_ignoreNextClipboardUpdate = false;
        return 0;
    }

    if (!g_captureEnabled)
    {
        OutputDebugStringW(L"cliphistory: capture paused, ignoring clipboard change\n");
        return 0;
    }

    OutputDebugStringW(L"clipboard changed\n");

    if (!OpenClipboard(hwnd))
        return 0;

    HGLOBAL hMem = GetClipboardData(CF_UNICODETEXT);
    if (!hMem)
    {
        CloseClipboard();
        return 0;
    }

    wchar_t* pData = static_cast<wchar_t*>(GlobalLock(hMem));
    if (!pData)
    {
        CloseClipboard();
        return 0;
    }

    std::wstring wContent(pData);
    GlobalUnlock(hMem);
    CloseClipboard();

    int size = WideCharToMultiByte(
        CP_UTF8, 0,
        wContent.c_str(), -1,
        nullptr, 0,
        nullptr, nullptr);

    std::string content(size - 1, '\0');

    WideCharToMultiByte(
        CP_UTF8, 0,
        wContent.c_str(), -1,
        content.data(), size,
        nullptr, nullptr);

    if (LooksLikeInternalApiPayload(content))
    {
        OutputDebugStringA("cliphistory: ignoring internal API request/response JSON on clipboard\n");
        return 0;
    }

    SYSTEMTIME st;
    GetLocalTime(&st);

    char timestamp[20];
    sprintf_s(timestamp, "%04d-%02d-%02d %02d:%02d:%02d",
    st.wYear, st.wMonth, st.wDay,
    st.wHour, st.wMinute, st.wSecond);

    if (g_webview)
    {
        auto escapeJS = [](std::wstring s)
        {
            std::wstring out;
            for (wchar_t c : s)
            {
                switch (c)
                {
                case L'\\': out += L"\\\\"; break;
                case L'\'': out += L"\\'"; break;
                case L'\n': out += L"\\n"; break;
                case L'\r': break;
                case L'\t': out += L"\\t"; break;
                default: out += c; break;
                }
            }
            return out;
        };

        wchar_t date[20];
        swprintf_s(date, L"%04d-%02d-%02d %02d:%02d:%02d",
            st.wYear, st.wMonth, st.wDay,
            st.wHour, st.wMinute, st.wSecond);

        wchar_t time[6];
        swprintf_s(time, L"%02d:%02d", st.wHour, st.wMinute);

        std::wstring script =
            L"addClip('Clipboard','" + escapeJS(wContent) +
            L"','Text','" + std::wstring(date) +
            L"','" + std::wstring(time) +
            L"','text');";

        g_webview->ExecuteScript(script.c_str(), nullptr);
    }

    return 0;
}
        default:
        return DefWindowProc(hwnd, msg, wParam, lParam);
    }


}