path = r'D:\New folder (3)\habino-accounting\src\components\Dashboard.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_block = '''isPostReset={isPostResetGuide}
      />}'''

new_block = '''isPostReset={isPostResetGuide}
        isSuperAdminContext={currentUser?.role === 'super_admin'}
      />}'''

content = content.replace(old_block, new_block)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Updated TenantWorkflowWelcomeModal props')