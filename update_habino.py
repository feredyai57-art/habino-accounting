import re

path = r"D:\New folder (3)\habino-accounting\src\components\HabinoAdminPanel.tsx"
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add AlertTriangle to imports
content = content.replace(
    "AlertTriangle,",
    "AlertTriangle,\n  AlertTriangle as AlertTriangleIcon,"
)

# Add warning banner after the Selected Tenant Quick Context Pill
old_block = '''        {/* Selected Tenant Quick Context Pill */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">?????? ??? ????? ????:</span>
            <span className="font-bold text-white bg-slate-800 px-3 py-1 rounded-lg border border-slate-700 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              {selectedTenant?.name} ({selectedTenant?.id})
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-900/60 text-blue-200 border border-blue-700">
              ???: {selectedTenant?.subscription?.planNameFa || '????'}
            </span>
          </div>
        </div>
      </div>'''

new_block = '''        {/* Selected Tenant Quick Context Pill */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">?????? ??? ????? ????:</span>
            <span className="font-bold text-white bg-slate-800 px-3 py-1 rounded-lg border border-slate-700 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              {selectedTenant?.name} ({selectedTenant?.id})
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-900/60 text-blue-200 border border-blue-700">
              ???: {selectedTenant?.subscription?.planNameFa || '????'}
            </span>
          </div>
        </div>

        {/* Financial Data Access Warning */}
        <div className="mt-4 pt-4 border-t border-slate-800 p-3 bg-amber-500/10 border-amber-500/30 rounded-xl flex items-start gap-3">
          <AlertTriangleIcon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200 leading-relaxed">
            <p className="font-bold text-amber-100">??????? ?????? ???????? ????</p>
            <p className="mt-1">
              ??? ????? ???? ?????? ?????? ? ???????? ???. ?????? ?? ???????? ???? ???????? (????????? ?????? ?????????? ???? ??? ????????? ?????) ?? ???? ??? ??? ???? ????.
              ???? ???????? ?????? ?? ???? �?????? ?? ??? ?????� ???? ???? ?? ??????? ?????? ??????? ????.
            </p>
          </div>
        </div>
      </div>'''

content = content.replace(old_block, new_block)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("HabinoAdminPanel.tsx updated successfully")
