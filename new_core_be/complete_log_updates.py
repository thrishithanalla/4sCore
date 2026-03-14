#!/usr/bin/env python
"""Complete all remaining log_transaction updates"""
import re
import os

def add_log_after_line(content, search_pattern, log_code, json_fields, indent="        "):
    """Add log_transaction call after a specific pattern"""
    # Build json_values string
    json_lines = [f'"{k}": {v}' for k, v in json_fields.items()]
    json_str = (',\n' + indent + '    ').join(json_lines)

    log_block = f'''
{indent}# Log successful {log_code.split('_')[-1].lower()}
{indent}await log_transaction(
{indent}    request=request,
{indent}    log_code=LogCodes.{log_code},
{indent}    json_values={{
{indent}        {json_str}
{indent}    }},
{indent}    level="info"
{indent})
'''

    # Find and replace
    pattern = re.compile(search_pattern, re.MULTILINE | re.DOTALL)
    if pattern.search(content):
        replacement = r'\1' + log_block + r'\n\2'
        content = pattern.sub(replacement, content)
        return content, True
    return content, False

def update_file(filepath, updates):
    """Update a single file with multiple log_transaction calls"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    modified = False
    for search_pattern, log_code, json_fields in updates:
        content, success = add_log_after_line(content, search_pattern, log_code, json_fields)
        if success:
            modified = True
            print(f"  [OK] Added {log_code}")
        else:
            print(f"  [SKIP] Pattern not found for {log_code}")

    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

    return modified

# Define all remaining updates
UPDATES = {
    'feedback_router.py': [
        (r'(created_feedback = await create_feedback\([^)]+\))\s*\n(\s*)return JSONResponse',
         'FEEDBACK_CREATED',
         {'"feedbackId"': 'created_feedback.get("_id", "")', '"createdBy"': 'current_user.id'}),
        (r'(updated_feedback = await update_feedback\([^)]+\))\s*\n(\s*)return JSONResponse',
         'FEEDBACK_UPDATED',
         {'"feedbackId"': 'feedback_id', '"updatedBy"': 'current_user.id'}),
        (r'(await delete_feedback\(feedback_id, current_user\.id\))\s*\n(\s*)return JSONResponse',
         'FEEDBACK_DELETED',
         {'"feedbackId"': 'feedback_id', '"deletedBy"': 'current_user.id'}),
        (r'(await restore_feedback\(feedback_id, current_user\.id\))\s*\n(\s*)return JSONResponse',
         'FEEDBACK_RESTORED',
         {'"feedbackId"': 'feedback_id', '"restoredBy"': 'current_user.id'}),
    ],
    'feedback_master_router.py': [
        (r'(updated = await update_feedback_master\([^)]+\))\s*\n(\s*)return JSONResponse',
         'FEEDBACK_MASTER_UPDATED',
         {'"feedbackMasterId"': 'feedback_master_id', '"updatedBy"': 'current_user.id'}),
        (r'(await delete_feedback_master\(feedback_master_id, current_user\.id\))\s*\n(\s*)return JSONResponse',
         'FEEDBACK_MASTER_DELETED',
         {'"feedbackMasterId"': 'feedback_master_id', '"deletedBy"': 'current_user.id'}),
        (r'(await restore_feedback_master\(feedback_master_id, current_user\.id\))\s*\n(\s*)return JSONResponse',
         'FEEDBACK_MASTER_RESTORED',
         {'"feedbackMasterId"': 'feedback_master_id', '"restoredBy"': 'current_user.id'}),
    ],
    'unit_type_router.py': [
        (r'(result = await create_unit_type\([^)]+\))\s*\n(\s*)return JSONResponse',
         'UNIT_TYPE_CREATED',
         {'"unitTypeId"': 'result.get("_id", "")', '"name"': 'result.get("name", "")', '"createdBy"': 'current_user.id'}),
        (r'(result = await update_unit_type\([^)]+\))\s*\n(\s*)return JSONResponse',
         'UNIT_TYPE_UPDATED',
         {'"unitTypeId"': 'unit_type_id', '"updatedBy"': 'current_user.id'}),
    ],
    'unit_villages_router.py': [
        (r'(result = await create_unit_village\([^)]+\))\s*\n(\s*)return JSONResponse',
         'UNIT_VILLAGES_CREATED',
         {'"unitVillageId"': 'result.get("_id", "")', '"createdBy"': 'current_user.id'}),
        (r'(result = await update_unit_village\([^)]+\))\s*\n(\s*)return JSONResponse',
         'UNIT_VILLAGES_UPDATED',
         {'"unitVillageId"': 'unit_village_id', '"updatedBy"': 'current_user.id'}),
    ],
    'prompt_router.py': [
        (r'(updated = await update_prompt\([^)]+\))\s*\n(\s*)return JSONResponse',
         'PROMPT_UPDATED',
         {'"promptId"': 'prompt_id', '"updatedBy"': 'current_user.id'}),
        (r'(await soft_delete_prompt\(prompt_id, current_user\.id\))\s*\n(\s*)return JSONResponse',
         'PROMPT_DELETED',
         {'"promptId"': 'prompt_id', '"deletedBy"': 'current_user.id'}),
        (r'(await restore_prompt\(prompt_id, current_user\.id\))\s*\n(\s*)return JSONResponse',
         'PROMPT_RESTORED',
         {'"promptId"': 'prompt_id', '"restoredBy"': 'current_user.id'}),
    ],
    'error_master_router.py': [
        (r'(updated = await update_error_master\([^)]+\))\s*\n(\s*)return JSONResponse',
         'ERROR_MASTER_UPDATED',
         {'"errorMasterId"': 'error_master_id', '"updatedBy"': 'current_user.id'}),
        (r'(await delete_error_master\(error_master_id, current_user\.id\))\s*\n(\s*)return JSONResponse',
         'ERROR_MASTER_DELETED',
         {'"errorMasterId"': 'error_master_id', '"deletedBy"': 'current_user.id'}),
        (r'(await restore_error_master\(error_master_id, current_user\.id\))\s*\n(\s*)return JSONResponse',
         'ERROR_MASTER_RESTORED',
         {'"errorMasterId"': 'error_master_id', '"restoredBy"': 'current_user.id'}),
    ],
    'designation_master_router.py': [
        (r'(result = await create_designation\([^)]+\))\s*\n(\s*)return JSONResponse',
         'DESIGNATION_CREATED',
         {'"designationId"': 'result.get("_id", "")', '"name"': 'result.get("name", "")', '"createdBy"': 'current_user.id'}),
        (r'(result = await update_designation\([^)]+\))\s*\n(\s*)return JSONResponse',
         'DESIGNATION_UPDATED',
         {'"designationId"': 'designation_id', '"updatedBy"': 'current_user.id'}),
        (r'(await delete_designation\(designation_id, current_user\.id\))\s*\n(\s*)return JSONResponse',
         'DESIGNATION_DELETED',
         {'"designationId"': 'designation_id', '"deletedBy"': 'current_user.id'}),
        (r'(await restore_designation\(designation_id, current_user\.id\))\s*\n(\s*)return JSONResponse',
         'DESIGNATION_RESTORED',
         {'"designationId"': 'designation_id', '"restoredBy"': 'current_user.id'}),
    ],
    'test_master_router.py': [
        (r'(updated = await update_test_master\([^)]+\))\s*\n(\s*)return JSONResponse',
         'TEST_MASTER_UPDATED',
         {'"testMasterId"': 'test_master_id', '"updatedBy"': 'current_user.id'}),
        (r'(await delete_test_master\(test_master_id, current_user\.id\))\s*\n(\s*)return JSONResponse',
         'TEST_MASTER_DELETED',
         {'"testMasterId"': 'test_master_id', '"deletedBy"': 'current_user.id'}),
        (r'(await restore_test_master\(test_master_id, current_user\.id\))\s*\n(\s*)return JSONResponse',
         'TEST_MASTER_RESTORED',
         {'"testMasterId"': 'test_master_id', '"restoredBy"': 'current_user.id'}),
    ],
    'permissions_mapping_router.py': [
        (r'(created = await create_permission_mapping\([^)]+\))\s*\n(\s*)return JSONResponse',
         'PERMISSION_MAPPING_CREATED',
         {'"permissionMappingId"': 'created.get("_id", "")', '"createdBy"': 'current_user.id'}),
        (r'(updated = await update_permission_mapping\([^)]+\))\s*\n(\s*)return JSONResponse',
         'PERMISSION_MAPPING_UPDATED',
         {'"permissionMappingId"': 'mapping_id', '"updatedBy"': 'current_user.id'}),
        (r'(await delete_permission_mapping\(mapping_id, current_user\.id\))\s*\n(\s*)return JSONResponse',
         'PERMISSION_MAPPING_DELETED',
         {'"permissionMappingId"': 'mapping_id', '"deletedBy"': 'current_user.id'}),
        (r'(await restore_permission_mapping\(mapping_id, current_user\.id\))\s*\n(\s*)return JSONResponse',
         'PERMISSION_MAPPING_RESTORED',
         {'"permissionMappingId"': 'mapping_id', '"restoredBy"': 'current_user.id'}),
    ],
    'prompt_execution_router.py': [
        (r'(created_execution = await create_prompt_execution\([^)]+\))\s*\n(\s*)return JSONResponse',
         'PROMPT_EXECUTION_CREATED',
         {'"promptExecutionId"': 'created_execution.get("_id", "")', '"createdBy"': 'current_user.id'}),
        (r'(await delete_prompt_execution\(prompt_execution_id, current_user\.id\))\s*\n(\s*)return JSONResponse',
         'PROMPT_EXECUTION_DELETED',
         {'"promptExecutionId"': 'prompt_execution_id', '"deletedBy"': 'current_user.id'}),
    ],
    'test_execution_router.py': [
        (r'(created_execution = await create_test_execution\([^)]+\))\s*\n(\s*)return JSONResponse',
         'TEST_EXECUTION_CREATED',
         {'"testExecutionId"': 'created_execution.get("_id", "")', '"createdBy"': 'current_user.id'}),
        (r'(await delete_test_execution\(test_execution_id, current_user\.id\))\s*\n(\s*)return JSONResponse',
         'TEST_EXECUTION_DELETED',
         {'"testExecutionId"': 'test_execution_id', '"deletedBy"': 'current_user.id'}),
    ],
}

def main():
    basedir = 'app/api/v1/routers'

    for filename, updates in UPDATES.items():
        filepath = os.path.join(basedir, filename)
        if not os.path.exists(filepath):
            print(f"[ERROR] File not found: {filepath}")
            continue

        print(f"\nProcessing {filename}...")
        modified = update_file(filepath, updates)
        if modified:
            print(f"[SUCCESS] Updated {filename}")
        else:
            print(f"[WARNING] No changes to {filename}")

if __name__ == '__main__':
    main()
