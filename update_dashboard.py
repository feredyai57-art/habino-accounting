path = r"D:\New folder (3)\habino-accounting\src\components\Dashboard.tsx"
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add User to imports if not present
import_section_end = content.find("} from 'lucide-react';")
if import_section_end > 0:
    import_section = content[:import_section_end]
    if "User" not in import_section:
        content = content.replace("TrendingUp,", "TrendingUp,\n  User,")

# Add impersonation banner after the opening div
old_block = '''  return (
    <div className="space-y-4 rounded-2xl bg-[#f3f8f8] p-3 pb-5 text-[#193b4a]" id="dashboard-container">
      {/* Header & Quick stats */}'''

new_block = '''  return (
    <div className="space-y-4 rounded-2xl bg-[#f3f8f8] p-3 pb-5 text-[#193b4a]" id="dashboard-container">
      {/* Impersonation Mode Banner */}
      {currentUser?.role === 'super_admin' && activeTenant && (
        <div className="mb-4 p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-center gap-4 animate-fadeIn" role="status">
          <div className="p-3 bg-amber-100 rounded-xl text-amber-700">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-amber-900 text-sm">حالت مصیفی — نمایش داده‌های مستأجر</p>
            <p className="text-amber-800 text-xs mt-0.5">
              شما به عنوان سوپرادمین در حال مشاهده داده‌های مالی مستأجر <strong>{activeTenant.name}</strong> ({activeTenant.id}) هستید.
              این حالت برای راهنمایی تلفنی و پشتیبانی فعال شده است. تمام عملیات در لاگ ممیزی ثبت می‌شوند.
            </p>
          </div>
          <span className="px-3 py-1 bg-amber-200 text-amber-900 rounded-full text-xs font-bold border border-amber-300">
            مصیفی فعال
          </span>
        </div>
      )}

      {/* Header & Quick stats */}'''

content = content.replace(old_block, new_block)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Dashboard.tsx updated successfully")