#pragma once
#include <string>

bool InitDatabase();

void SaveClip(const std::string& content, const std::string& created_at);

void DeleteClip(int id);

void shutdownDatabase();