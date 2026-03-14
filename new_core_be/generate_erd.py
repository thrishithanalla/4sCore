"""
ERD Diagram Generator for UC2 Core Database
Print-ready version with EXTRA LARGE fonts - readable without zooming
"""

import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle
import numpy as np

# Set up figure - optimized for print readability
fig, ax = plt.subplots(1, 1, figsize=(48, 36), dpi=100)
ax.set_xlim(0, 48)
ax.set_ylim(0, 36)
ax.set_aspect('equal')
ax.axis('off')
fig.patch.set_facecolor('#ffffff')

# Color scheme
COLORS = {
    'master_data': '#bbdefb',
    'core': '#c8e6c9',
    'rbac': '#ffe0b2',
    'workflow': '#f8bbd9',
    'prompt': '#e1bee7',
    'logging': '#ffcdd2',
    'config': '#b2ebf2',
    'header_master': '#1565c0',
    'header_core': '#2e7d32',
    'header_rbac': '#ef6c00',
    'header_workflow': '#ad1457',
    'header_prompt': '#6a1b9a',
    'header_logging': '#c62828',
    'header_config': '#00838f',
    'pk': '#ffd600',
    'fk': '#ff6d00',
    'border': '#263238',
    'line': '#455a64',
}

def draw_entity(ax, x, y, width, height, name, fields, bg_color, header_color):
    """Draw entity with font size 22"""
    # Shadow
    shadow = FancyBboxPatch((x + 0.08, y - 0.08), width, height,
                            boxstyle="round,pad=0.01,rounding_size=0.1",
                            facecolor='#9e9e9e', edgecolor='none')
    ax.add_patch(shadow)

    # Main box
    rect = FancyBboxPatch((x, y), width, height,
                          boxstyle="round,pad=0.01,rounding_size=0.1",
                          facecolor=bg_color, edgecolor=COLORS['border'], linewidth=2.5)
    ax.add_patch(rect)

    # Header
    header_height = 0.7
    header = FancyBboxPatch((x, y + height - header_height), width, header_height,
                            boxstyle="round,pad=0.01,rounding_size=0.1",
                            facecolor=header_color, edgecolor=COLORS['border'], linewidth=2.5)
    ax.add_patch(header)

    # Entity name - font size 22
    ax.text(x + width/2, y + height - header_height/2, name,
            ha='center', va='center', fontsize=22, fontweight='bold', color='white')

    # Fields
    field_height = (height - header_height - 0.15) / max(len(fields), 1)
    for i, (field_name, field_type, is_pk, is_fk) in enumerate(fields):
        fy = y + height - header_height - (i + 1) * field_height + field_height/2 - 0.05

        # PK/FK markers
        if is_pk:
            ax.plot(x + 0.12, fy, 'o', color=COLORS['pk'], markersize=10,
                    markeredgecolor='#333', markeredgewidth=1.5)
        elif is_fk:
            ax.plot(x + 0.12, fy, 's', color=COLORS['fk'], markersize=9,
                    markeredgecolor='#333', markeredgewidth=1.5)

        # Field text - font size 26 for field names
        ax.text(x + 0.28, fy, field_name, ha='left', va='center', fontsize=26,
                fontweight='bold' if is_pk else 'medium', color='#0d47a1')
        ax.text(x + width - 0.1, fy, field_type, ha='right', va='center',
                fontsize=26, color='#37474f')

def draw_line(ax, x1, y1, x2, y2, c1="1", c2="N"):
    """Draw relationship line"""
    ax.plot([x1, x2], [y1, y2], color=COLORS['line'], linewidth=2.5)

    dx, dy = x2 - x1, y2 - y1
    # Start label
    ax.text(x1 + dx*0.15, y1 + dy*0.15, c1, fontsize=22, ha='center', va='center',
            fontweight='bold', color='#b71c1c',
            bbox=dict(boxstyle='round,pad=0.2', facecolor='white', edgecolor='#b71c1c', lw=1.5))
    # End label
    ax.text(x1 + dx*0.85, y1 + dy*0.85, c2, fontsize=22, ha='center', va='center',
            fontweight='bold', color='#b71c1c',
            bbox=dict(boxstyle='round,pad=0.2', facecolor='white', edgecolor='#b71c1c', lw=1.5))

# ============================================================================
# ROW 1 - MASTER DATA (Top)
# ============================================================================

draw_entity(ax, 0.5, 30, 5.5, 4.5, 'department_master', [
    ('_id', 'ObjectId', True, False),
    ('name', 'String', False, False),
    ('cctnsDeptCd', 'String', False, False),
    ('isActive', 'Boolean', False, False),
    ('isDelete', 'Boolean', False, False),
    ('createdBy', 'ObjectId', False, True),
], COLORS['master_data'], COLORS['header_master'])

draw_entity(ax, 6.5, 30, 5.5, 4.5, 'district_master', [
    ('_id', 'ObjectId', True, False),
    ('name', 'String', False, False),
    ('cctnsDistrictCd', 'String', False, False),
    ('stateName', 'String', False, False),
    ('isActive', 'Boolean', False, False),
    ('isDelete', 'Boolean', False, False),
], COLORS['master_data'], COLORS['header_master'])

draw_entity(ax, 12.5, 30, 5.5, 4.5, 'mandal_master', [
    ('_id', 'ObjectId', True, False),
    ('districtId', 'ObjectId', False, True),
    ('mandalName', 'String', False, False),
    ('isActive', 'Boolean', False, False),
    ('isDelete', 'Boolean', False, False),
    ('createdBy', 'ObjectId', False, True),
], COLORS['master_data'], COLORS['header_master'])

draw_entity(ax, 18.5, 30, 5.5, 4.5, 'rank_master', [
    ('_id', 'ObjectId', True, False),
    ('name', 'String', False, False),
    ('cctnsRankCd', 'Integer', False, False),
    ('shortCode', 'String', False, False),
    ('isActive', 'Boolean', False, False),
    ('isDelete', 'Boolean', False, False),
], COLORS['master_data'], COLORS['header_master'])

draw_entity(ax, 24.5, 30, 5.5, 4.5, 'designation_master', [
    ('_id', 'ObjectId', True, False),
    ('name', 'String', False, False),
    ('designationCd', 'String', False, False),
    ('isActive', 'Boolean', False, False),
    ('isDelete', 'Boolean', False, False),
    ('createdBy', 'ObjectId', False, True),
], COLORS['master_data'], COLORS['header_master'])

draw_entity(ax, 30.5, 30, 5.5, 4.5, 'unit_type_master', [
    ('_id', 'ObjectId', True, False),
    ('name', 'String', False, False),
    ('departmentId', 'ObjectId', False, True),
    ('level', 'Integer', False, False),
    ('isActive', 'Boolean', False, False),
    ('isDelete', 'Boolean', False, False),
], COLORS['master_data'], COLORS['header_master'])

draw_entity(ax, 36.5, 30, 5.5, 4.5, 'value_sets_master', [
    ('_id', 'ObjectId', True, False),
    ('key', 'String', False, False),
    ('module', 'String', False, False),
    ('items[]', 'Array', False, False),
    ('isActive', 'Boolean', False, False),
    ('isDelete', 'Boolean', False, False),
], COLORS['config'], COLORS['header_config'])

draw_entity(ax, 42.5, 30, 5, 4.5, 'log_master', [
    ('_id', 'ObjectId', True, False),
    ('logType', 'String', False, False),
    ('logCode', 'String', False, False),
    ('description', 'String', False, False),
    ('isActive', 'Boolean', False, False),
    ('isDelete', 'Boolean', False, False),
], COLORS['logging'], COLORS['header_logging'])

# ============================================================================
# ROW 2 - CORE ENTITIES
# ============================================================================

draw_entity(ax, 0.5, 21, 7, 7, 'personnel_master', [
    ('_id', 'ObjectId', True, False),
    ('email', 'EmailStr', False, False),
    ('userId', 'String(8)', False, False),
    ('name', 'String', False, False),
    ('password', 'String', False, False),
    ('departmentId', 'ObjectId', False, True),
    ('rankId', 'ObjectId', False, True),
    ('units[]', 'Array', False, False),
    ('mobile', 'String', False, False),
    ('isActive', 'Boolean', False, False),
], COLORS['core'], COLORS['header_core'])

draw_entity(ax, 8, 21, 7, 7, 'unit_master', [
    ('_id', 'ObjectId', True, False),
    ('policeRefId', 'String', False, False),
    ('name', 'String', False, False),
    ('districtId', 'ObjectId', False, True),
    ('responsibleUserId', 'ObjectId', False, True),
    ('unitTypeId', 'ObjectId', False, True),
    ('departmentId', 'ObjectId', False, True),
    ('parentUnitId', 'ObjectId', False, True),
    ('isActive', 'Boolean', False, False),
    ('isDelete', 'Boolean', False, False),
], COLORS['core'], COLORS['header_core'])

draw_entity(ax, 15.5, 23, 5.5, 4, 'unit_villages_master', [
    ('_id', 'ObjectId', True, False),
    ('unitId', 'ObjectId', False, True),
    ('mandalId', 'ObjectId', False, True),
    ('villageName', 'String', False, False),
    ('isActive', 'Boolean', False, False),
], COLORS['core'], COLORS['header_core'])

draw_entity(ax, 21.5, 21, 6.5, 6.5, 'user_mapping', [
    ('_id', 'ObjectId', True, False),
    ('userId', 'ObjectId', False, True),
    ('roleId', 'ObjectId', False, True),
    ('unitId', 'ObjectId', False, True),
    ('permissions[]', 'Array', False, False),
    ('additionalPerms[]', 'Array', False, False),
    ('exclusionPerms[]', 'Array', False, False),
    ('isActive', 'Boolean', False, False),
], COLORS['rbac'], COLORS['header_rbac'])

draw_entity(ax, 28.5, 21, 6.5, 6.5, 'user_role_permissions', [
    ('_id', 'ObjectId', True, False),
    ('userId', 'ObjectId', False, True),
    ('roleId', 'ObjectId', False, True),
    ('unitId', 'ObjectId', False, True),
    ('additionalPerms[]', 'Array', False, False),
    ('exclusionPerms[]', 'Array', False, False),
    ('isActive', 'Boolean', False, False),
    ('isDelete', 'Boolean', False, False),
], COLORS['rbac'], COLORS['header_rbac'])

draw_entity(ax, 35.5, 21, 6, 5.5, 'error_master', [
    ('_id', 'ObjectId', True, False),
    ('errorCode', 'String', False, False),
    ('severity', 'String', False, False),
    ('messages', 'JSON', False, False),
    ('isActive', 'Boolean', False, False),
    ('isDelete', 'Boolean', False, False),
], COLORS['logging'], COLORS['header_logging'])

draw_entity(ax, 42, 21, 6, 6, 'error_logs', [
    ('_id', 'ObjectId', True, False),
    ('errorCode', 'String', False, False),
    ('eventDateTime', 'DateTime', False, False),
    ('actorUserId', 'ObjectId', False, True),
    ('sourceType', 'String', False, False),
    ('stack', 'String', False, False),
    ('isDelete', 'Boolean', False, False),
], COLORS['logging'], COLORS['header_logging'])

# ============================================================================
# ROW 3 - RBAC ENTITIES
# ============================================================================

draw_entity(ax, 0.5, 12, 6, 6.5, 'roles_master', [
    ('_id', 'ObjectId', True, False),
    ('name', 'String', False, False),
    ('shortCode', 'String', False, False),
    ('description', 'String', False, False),
    ('permissions[]', 'Array', False, False),
    ('isActive', 'Boolean', False, False),
    ('isDelete', 'Boolean', False, False),
    ('createdBy', 'ObjectId', False, True),
], COLORS['rbac'], COLORS['header_rbac'])

draw_entity(ax, 7, 12, 6, 6, 'permissions_master', [
    ('_id', 'ObjectId', True, False),
    ('name', 'String', False, False),
    ('shortCode', 'String', False, False),
    ('description', 'String', False, False),
    ('isActive', 'Boolean', False, False),
    ('isDelete', 'Boolean', False, False),
    ('createdBy', 'ObjectId', False, True),
], COLORS['rbac'], COLORS['header_rbac'])

draw_entity(ax, 13.5, 12, 6, 6, 'modules_master', [
    ('_id', 'ObjectId', True, False),
    ('name', 'String', False, False),
    ('shortCode', 'String', False, False),
    ('description', 'String', False, False),
    ('isActive', 'Boolean', False, False),
    ('isDelete', 'Boolean', False, False),
    ('createdBy', 'ObjectId', False, True),
], COLORS['rbac'], COLORS['header_rbac'])

draw_entity(ax, 20, 12, 6, 6.5, 'jobs_master', [
    ('_id', 'ObjectId', True, False),
    ('name', 'String', False, False),
    ('shortCode', 'String', False, False),
    ('menuEligible', 'Boolean', False, False),
    ('displayName', 'String', False, False),
    ('route', 'String', False, False),
    ('displayOrder', 'Integer', False, False),
    ('isActive', 'Boolean', False, False),
], COLORS['rbac'], COLORS['header_rbac'])

draw_entity(ax, 26.5, 12, 6.5, 6, 'permissions_mapping', [
    ('_id', 'ObjectId', True, False),
    ('moduleId', 'ObjectId', False, True),
    ('jobId', 'ObjectId', False, True),
    ('permissionId', 'ObjectId', False, True),
    ('moduleName', 'String', False, False),
    ('jobName', 'String', False, False),
    ('isActive', 'Boolean', False, False),
], COLORS['rbac'], COLORS['header_rbac'])

draw_entity(ax, 33.5, 12, 6, 5.5, 'module_job_mapping', [
    ('_id', 'ObjectId', True, False),
    ('moduleId', 'ObjectId', False, True),
    ('jobId', 'ObjectId', False, True),
    ('moduleName', 'String', False, False),
    ('jobName', 'String', False, False),
    ('isActive', 'Boolean', False, False),
], COLORS['rbac'], COLORS['header_rbac'])

draw_entity(ax, 40, 12, 5.5, 5.5, 'module_hierarchy', [
    ('_id', 'ObjectId', True, False),
    ('moduleId', 'ObjectId', False, True),
    ('parentModuleId', 'ObjectId', False, True),
    ('level', 'Integer', False, False),
    ('path', 'String', False, False),
    ('isActive', 'Boolean', False, False),
], COLORS['rbac'], COLORS['header_rbac'])

draw_entity(ax, 42, 27.5, 5.5, 4, 'logs', [
    ('_id', 'ObjectId', True, False),
    ('logCode', 'String', False, False),
    ('eventDateTime', 'DateTime', False, False),
    ('actorUserId', 'ObjectId', False, True),
    ('details', 'JSON', False, False),
], COLORS['logging'], COLORS['header_logging'])

# ============================================================================
# ROW 4 - WORKFLOW & PROMPTS
# ============================================================================

draw_entity(ax, 0.5, 2, 7, 7.5, 'approval_flow_master', [
    ('_id', 'ObjectId', True, False),
    ('moduleId', 'ObjectId', False, True),
    ('flowName', 'String', False, False),
    ('finalApprovalUnitId', 'ObjectId', False, True),
    ('finalApprovalRankId', 'ObjectId', False, True),
    ('districtId', 'ObjectId', False, True),
    ('furtherProcess[]', 'Array', False, False),
    ('ifRejected', 'String', False, False),
    ('isActive', 'Boolean', False, False),
], COLORS['workflow'], COLORS['header_workflow'])

draw_entity(ax, 8, 2, 7, 7.5, 'approval_chain', [
    ('_id', 'ObjectId', True, False),
    ('moduleId', 'ObjectId', False, True),
    ('requestId', 'String', False, False),
    ('currentUnitId', 'ObjectId', False, True),
    ('currentApproverId', 'ObjectId', False, True),
    ('finalApprovalUnitId', 'ObjectId', False, True),
    ('approvalStatus', 'String', False, False),
    ('transactionHistory[]', 'Array', False, False),
    ('isDelete', 'Boolean', False, False),
], COLORS['workflow'], COLORS['header_workflow'])

draw_entity(ax, 15.5, 2, 6.5, 7, 'prompt_master', [
    ('_id', 'ObjectId', True, False),
    ('type', 'String', False, False),
    ('name', 'String', False, False),
    ('aiRole', 'String', False, False),
    ('moduleId', 'ObjectId', False, True),
    ('llm', 'String', False, False),
    ('settingsJson', 'JSON', False, False),
    ('isActive', 'Boolean', False, False),
    ('isDelete', 'Boolean', False, False),
], COLORS['prompt'], COLORS['header_prompt'])

draw_entity(ax, 22.5, 2, 6.5, 7, 'prompt_execution', [
    ('_id', 'ObjectId', True, False),
    ('promptId', 'ObjectId', False, True),
    ('userId', 'ObjectId', False, True),
    ('executionDateTime', 'DateTime', False, False),
    ('promptOutput', 'String', False, False),
    ('inputTokenCount', 'Integer', False, False),
    ('outputTokenCount', 'Integer', False, False),
    ('cost', 'Float', False, False),
    ('isDelete', 'Boolean', False, False),
], COLORS['prompt'], COLORS['header_prompt'])

draw_entity(ax, 29.5, 2, 5.5, 5.5, 'feedback_master', [
    ('_id', 'ObjectId', True, False),
    ('componentType', 'String', False, False),
    ('name', 'String', False, False),
    ('options', 'JSON', False, False),
    ('isActive', 'Boolean', False, False),
    ('isDelete', 'Boolean', False, False),
], COLORS['prompt'], COLORS['header_prompt'])

draw_entity(ax, 35.5, 2, 5.5, 6, 'feedback', [
    ('_id', 'ObjectId', True, False),
    ('feedbackMasterId', 'ObjectId', False, True),
    ('comment', 'String', False, False),
    ('userFeedback', 'JSON', False, False),
    ('isLiked', 'Boolean', False, False),
    ('rating', 'Float', False, False),
    ('createdBy', 'ObjectId', False, True),
], COLORS['prompt'], COLORS['header_prompt'])

draw_entity(ax, 41.5, 2, 5.5, 5.5, 'test_master', [
    ('_id', 'ObjectId', True, False),
    ('moduleId', 'ObjectId', False, True),
    ('name', 'String', False, False),
    ('questions[]', 'Array', False, False),
    ('isActive', 'Boolean', False, False),
    ('isDelete', 'Boolean', False, False),
], COLORS['prompt'], COLORS['header_prompt'])

draw_entity(ax, 41.5, 8, 5.5, 4.5, 'test_execution', [
    ('_id', 'ObjectId', True, False),
    ('testMasterId', 'ObjectId', False, True),
    ('answers[]', 'Array', False, False),
    ('result', 'PASS/FAIL', False, False),
    ('isActive', 'Boolean', False, False),
], COLORS['prompt'], COLORS['header_prompt'])

# Config entities
draw_entity(ax, 35.5, 8.5, 5.5, 4, 'refresh_tokens', [
    ('_id', 'ObjectId', True, False),
    ('userId', 'ObjectId', False, True),
    ('token', 'String', False, False),
    ('expiresAt', 'DateTime', False, False),
], COLORS['config'], COLORS['header_config'])

draw_entity(ax, 29.5, 8.5, 5.5, 4, 'otp_verification', [
    ('_id', 'ObjectId', True, False),
    ('email', 'String', False, False),
    ('otp', 'String', False, False),
    ('expiresAt', 'DateTime', False, False),
], COLORS['config'], COLORS['header_config'])

# ============================================================================
# RELATIONSHIPS
# ============================================================================

# Department -> Personnel
draw_line(ax, 3.25, 30, 4, 28, "1", "N")

# District -> Unit
draw_line(ax, 9.25, 30, 11.5, 28, "1", "N")

# District -> Mandal
draw_line(ax, 12, 32.25, 12.5, 32.25, "1", "N")

# Mandal -> Unit Villages
draw_line(ax, 15.25, 30, 18.25, 27, "1", "N")

# Rank -> Personnel
draw_line(ax, 21.25, 30, 5.5, 28, "1", "N")

# Unit Type -> Unit
draw_line(ax, 33.25, 30, 13, 28, "1", "N")

# Personnel <-> Unit
draw_line(ax, 7.5, 24.5, 8, 24.5, "N", "N")

# Unit -> Unit Villages
draw_line(ax, 15, 25, 15.5, 25, "1", "N")

# Roles -> User Mapping
draw_line(ax, 6.5, 15, 21.5, 24, "1", "N")

# Personnel -> User Mapping
draw_line(ax, 7.5, 23, 21.5, 24.5, "1", "N")

# Unit -> User Mapping
draw_line(ax, 15, 23, 21.5, 23, "1", "N")

# Module -> Permissions Mapping
draw_line(ax, 19.5, 15, 26.5, 15, "1", "N")

# Jobs -> Permissions Mapping
draw_line(ax, 26, 15, 26.5, 15, "1", "N")

# Permission -> Permissions Mapping
draw_line(ax, 13, 14, 26.5, 14, "1", "N")

# Module -> Approval Flow
draw_line(ax, 16.5, 12, 4, 9.5, "1", "N")

# Module -> Approval Chain
draw_line(ax, 16.5, 12, 11.5, 9.5, "1", "N")

# Module -> Prompt
draw_line(ax, 19.5, 13, 18.75, 9, "1", "N")

# Module -> Test Master
draw_line(ax, 19.5, 14, 44.25, 7.5, "1", "N")

# Prompt -> Prompt Execution
draw_line(ax, 22, 5.5, 22.5, 5.5, "1", "N")

# Test -> Test Execution
draw_line(ax, 44.25, 7.5, 44.25, 8, "1", "N")

# Feedback Master -> Feedback
draw_line(ax, 35, 5, 35.5, 5, "1", "N")

# Personnel -> Error Logs
draw_line(ax, 7.5, 25, 45, 27, "1", "N")

# Personnel -> Refresh Tokens
draw_line(ax, 7.5, 22, 35.5, 10.5, "1", "N")

# ============================================================================
# LEGEND - LARGE AND CLEAR
# ============================================================================

legend_x, legend_y = 0.5, 0
ax.add_patch(FancyBboxPatch((legend_x, legend_y), 20, 2.5,
                            boxstyle="round,pad=0.01", facecolor='white',
                            edgecolor=COLORS['border'], linewidth=2))

ax.text(legend_x + 10, legend_y + 2.1, "LEGEND", ha='center', va='center',
        fontsize=22, fontweight='bold', color='#1a237e')

# Color boxes
colors_legend = [
    (COLORS['master_data'], "Master Data"),
    (COLORS['core'], "Core"),
    (COLORS['rbac'], "RBAC"),
    (COLORS['workflow'], "Workflow"),
    (COLORS['prompt'], "Prompts"),
    (COLORS['logging'], "Logging"),
    (COLORS['config'], "Config"),
]

for i, (color, label) in enumerate(colors_legend):
    lx = legend_x + 0.3 + i * 2.8
    ly = legend_y + 1.3
    ax.add_patch(Rectangle((lx, ly), 0.4, 0.4, facecolor=color,
                           edgecolor=COLORS['border'], linewidth=1.5))
    ax.text(lx + 0.55, ly + 0.2, label, fontsize=22, va='center', fontweight='bold')

# Symbol legend
ax.plot(legend_x + 0.5, legend_y + 0.5, 'o', color=COLORS['pk'], markersize=12,
        markeredgecolor='#333', markeredgewidth=1.5)
ax.text(legend_x + 0.8, legend_y + 0.5, "= PK", fontsize=22, va='center', fontweight='bold')

ax.plot(legend_x + 3, legend_y + 0.5, 's', color=COLORS['fk'], markersize=11,
        markeredgecolor='#333', markeredgewidth=1.5)
ax.text(legend_x + 3.3, legend_y + 0.5, "= FK", fontsize=22, va='center', fontweight='bold')

ax.text(legend_x + 6, legend_y + 0.5, "1──N = One to Many", fontsize=22,
        va='center', fontweight='bold')
ax.text(legend_x + 11.5, legend_y + 0.5, "N──N = Many to Many", fontsize=22,
        va='center', fontweight='bold')

# TITLE - font size 22
ax.text(24, 35.2, "UC2 Core Database - Entity Relationship Diagram",
        ha='center', va='center', fontsize=28, fontweight='bold', color='#0d47a1')
ax.text(24, 34.5, "MongoDB Collections with Relationships",
        ha='center', va='center', fontsize=22, color='#455a64')

# Save
plt.tight_layout()
plt.savefig('UC2_Core_ERD_Full.png', dpi=150, bbox_inches='tight',
            facecolor='white', edgecolor='none', pad_inches=0.3)
plt.savefig('UC2_Core_ERD_Full.pdf', bbox_inches='tight',
            facecolor='white', edgecolor='none', pad_inches=0.3)

print("=" * 50)
print("  ERD Generated - PRINT READY!")
print("=" * 50)
print("  Files: UC2_Core_ERD_Full.png / .pdf")
print("  Fonts: 11-24pt (readable without zoom)")
print("=" * 50)
