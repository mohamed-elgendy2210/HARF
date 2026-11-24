import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api.js';

const emptyDraft = { name: '', description: '', permissions: [], isActive: true };

const permissionGroups = [
  { id: 'users', title: 'إدارة المستخدمين', description: 'الحسابات والاعتماد والصلاحيات الإدارية' },
  { id: 'children', title: 'الأطفال', description: 'ملفات الأطفال وإدارتها' },
  { id: 'therapists', title: 'الأخصائيون', description: 'عرض الأخصائيين وإدارة حساباتهم' },
  { id: 'learningPaths', title: 'مسارات التعلّم', description: 'إعداد المسارات وتعيينها' },
  { id: 'activities', title: 'الأنشطة التعليمية', description: 'مكتبة الألعاب والأنشطة' },
  { id: 'questionnaires', title: 'الاستبيانات', description: 'إعداد استبيان التعلّم' },
  { id: 'bookings', title: 'الحجوزات والجلسات', description: 'متابعة الحجوزات وإدارة الجلسات' },
  { id: 'payments', title: 'المدفوعات والاشتراكات', description: 'عرض الطلبات ومراجعة التحويلات' },
  { id: 'reports', title: 'التقارير', description: 'تقارير المنصة والبيانات المالية' },
  { id: 'settings', title: 'إعدادات المنصة', description: 'إعدادات الموقع والهوية' },
  { id: 'roles', title: 'الأدوار والصلاحيات', description: 'إدارة الأدوار والمنح الإدارية' },
  { id: 'permissions', title: 'إدارة الصلاحيات', description: 'التحكم في نطاق صلاحيات المسؤولين' },
  { id: 'notifications', title: 'الإشعارات', description: 'إدارة التنبيهات' },
  { id: 'testimonials', title: 'آراء أولياء الأمور', description: 'مراجعة الآراء المنشورة' }
];

const permissionLabels = {
  'users.view': 'عرض الحسابات',
  'users.create': 'إنشاء حسابات',
  'users.edit': 'تعديل الحسابات',
  'users.approve': 'اعتماد الحسابات',
  'users.disable': 'إيقاف الحسابات',
  'users.delete': 'حذف طلبات التسجيل',
  'children.view': 'عرض ملفات الأطفال',
  'children.manage': 'إدارة ملفات الأطفال',
  'children.archive': 'أرشفة ملفات الأطفال',
  'therapists.view': 'عرض الأخصائيين',
  'therapists.manage': 'إدارة الأخصائيين',
  'therapists.approve': 'اعتماد الأخصائيين',
  'learningPaths.view': 'عرض مسارات التعلّم',
  'learningPaths.manage': 'إدارة المسارات والتعيينات',
  'activities.view': 'عرض الأنشطة',
  'activities.manage': 'إدارة الأنشطة والمكتبة',
  'questionnaires.view': 'عرض الاستبيانات',
  'questionnaires.manage': 'إدارة الاستبيانات',
  'bookings.view': 'عرض الحجوزات',
  'bookings.manage': 'إدارة الحجوزات',
  'sessions.manage': 'إدارة الجلسات والاجتماعات',
  'payments.view': 'عرض المدفوعات',
  'payments.verify': 'مراجعة المدفوعات',
  'subscriptions.manage': 'إدارة الاشتراكات',
  'reports.view': 'عرض التقارير',
  'reports.financial': 'عرض التقارير المالية',
  'settings.manage': 'إدارة إعدادات المنصة',
  'roles.manage': 'إدارة الأدوار',
  'permissions.manage': 'تعديل الصلاحيات',
  'notifications.manage': 'إدارة الإشعارات',
  'testimonials.manage': 'مراجعة آراء أولياء الأمور'
};

const roleDescriptions = {
  'super-admin': 'تحكم كامل في المنصة وإدارة الأدوار والصلاحيات.',
  admin: 'صلاحيات الإدارة الافتراضية، ويمكن تقييدها حسب الحاجة.',
  parent: 'دور محمي يتيح لولي الأمر الوصول إلى بيانات أسرته فقط.',
  therapist: 'دور محمي يتيح للأخصائي الوصول إلى جلساته وبياناتها المصرح بها.'
};

function canEditPermissions(role) {
  return !['super-admin', 'parent', 'therapist'].includes(role.key);
}

function permissionGroupId(permissionKey) {
  return permissionKey.split('.')[0];
}

function sortedPermissions(items) {
  return [...items].sort();
}

export default function AdminRoles({ canManagePermissions, canManageRoles, canViewUsers }) {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [administrators, setAdministrators] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState(emptyDraft);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [permissionSearch, setPermissionSearch] = useState('');

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedId) ?? null,
    [roles, selectedId]
  );
  const dirty = useMemo(() => {
    if (creating) return true;
    if (!selectedRole) return false;
    return draft.name.trim() !== selectedRole.name
      || draft.description.trim() !== (selectedRole.description ?? '')
      || draft.isActive !== selectedRole.isActive
      || JSON.stringify(sortedPermissions(draft.permissions))
        !== JSON.stringify(sortedPermissions(selectedRole.permissions));
  }, [creating, draft, selectedRole]);
  const displayedPermissions = useMemo(() => {
    const query = permissionSearch.trim().toLocaleLowerCase();
    return permissions.filter((permission) => !query
      || permission.key.toLocaleLowerCase().includes(query)
      || permissionLabels[permission.key]?.includes(query)
      || permission.description.toLocaleLowerCase().includes(query));
  }, [permissions, permissionSearch]);
  const groupedPermissions = useMemo(() => permissionGroups.map((group) => ({
    ...group,
    permissions: displayedPermissions.filter((permission) => permissionGroupId(permission.key) === group.id)
  })).filter((group) => group.permissions.length), [displayedPermissions]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [roleData, administratorData] = await Promise.all([
        apiRequest('/api/v1/admin/roles'),
        canManageRoles && canViewUsers
          ? apiRequest('/api/v1/admin/administrators')
          : Promise.resolve({ administrators: [] })
      ]);
      const { roles: roleList, permissions: catalog } = roleData;
      const { administrators: adminList } = administratorData;
      setRoles(roleList);
      setPermissions(catalog);
      setAdministrators(adminList);
      if (!creating && !roleList.some((role) => role.id === selectedId)) {
        setSelectedId(roleList[0]?.id ?? '');
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [canManageRoles, canViewUsers]);

  useEffect(() => {
    if (!selectedRole || creating) return;
    setDraft({
      name: selectedRole.name,
      description: selectedRole.description,
      permissions: selectedRole.permissions,
      isActive: selectedRole.isActive
    });
  }, [selectedRole, creating]);

  const togglePermission = (permission) => {
    setDraft((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission]
    }));
  };

  const toggleGroup = (groupPermissions, shouldEnable) => {
    const keys = groupPermissions.map(({ key }) => key);
    setDraft((current) => ({
      ...current,
      permissions: shouldEnable
        ? [...new Set([...current.permissions, ...keys])]
        : current.permissions.filter((permission) => !keys.includes(permission))
    }));
  };

  const resetDraft = () => {
    setCreating(false);
    if (selectedRole) {
      setDraft({
        name: selectedRole.name,
        description: selectedRole.description,
        permissions: selectedRole.permissions,
        isActive: selectedRole.isActive
      });
    } else {
      setDraft(emptyDraft);
    }
  };

  const saveRole = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (creating) {
        const { role } = await apiRequest('/api/v1/admin/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: draft.name,
            description: draft.description,
            permissions: draft.permissions
          })
        });
        setRoles((current) => [...current, role]);
        setSelectedId(role.id);
        setCreating(false);
      } else if (selectedRole) {
        const { role } = await apiRequest(`/api/v1/admin/roles/${selectedRole.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft)
        });
        setRoles((current) => current.map((item) => item.id === role.id ? role : item));
      }
      setNotice('تم حفظ الدور وصلاحياته.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const assignRole = async (administrator, roleId) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { administrator: updated } = await apiRequest(`/api/v1/admin/administrators/${administrator.id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId })
      });
      setAdministrators((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice('تم تحديث دور المسؤول وإنهاء جلساته السابقة.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteRole = async () => {
    if (!selectedRole || selectedRole.isSystemRole
      || !window.confirm(`حذف الدور «${selectedRole.name}»؟`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/v1/admin/roles/${selectedRole.id}`, { method: 'DELETE' });
      setRoles((current) => current.filter((role) => role.id !== selectedRole.id));
      setSelectedId('');
      setNotice('تم حذف الدور.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const editable = canManagePermissions && (creating || (selectedRole && canEditPermissions(selectedRole)));

  return (
    <section className="admin-dashboard__content admin-dashboard-panel">
      <div className="admin-dashboard-panel__heading">
        <div>
          <h2>الأدوار والصلاحيات</h2>
          <p>أدوار ولي الأمر والأخصائي والأدوار الأساسية محمية. لا تُطبّق الصلاحيات إلا في الخادم.</p>
        </div>
        <button type="button" className="button button--small button--outline" onClick={() => void load()} disabled={loading || busy}>
          تحديث
        </button>
      </div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && <p className="auth-message" role="status">{notice}</p>}
      {loading ? <p className="dashboard-loading" role="status">جارٍ تحميل الأدوار…</p> : (
        <>
          <div className="admin-roles__toolbar">
            <div className="admin-roles__role-list" aria-label="الأدوار">
              {roles.map((role) => (
                <button key={role.id} type="button"
                  className={`admin-roles__role-card${!creating && role.id === selectedId ? ' is-selected' : ''}`}
                  aria-pressed={!creating && role.id === selectedId}
                  onClick={() => {
                    setCreating(false);
                    setSelectedId(role.id);
                    setNotice('');
                  }}>
                  <span className="admin-roles__role-icon" aria-hidden="true">
                    {role.key === 'super-admin' ? '✦' : role.key === 'parent' ? '♙' : role.key === 'therapist' ? '✚' : '♜'}
                  </span>
                  <span className="admin-roles__role-copy">
                    <strong>{role.name}</strong>
                    <small>{role.isSystemRole ? 'دور أساسي محمي' : 'دور مخصص'} · {role.permissions.length} صلاحية</small>
                  </span>
                  <span className={`admin-roles__status${role.isActive ? '' : ' is-inactive'}`}>
                    {role.isActive ? 'نشط' : 'متوقف'}
                  </span>
                </button>
              ))}
              {canManagePermissions && (
                <button type="button"
                  className={`admin-roles__role-card admin-roles__role-card--create${creating ? ' is-selected' : ''}`}
                  aria-pressed={creating}
                  onClick={() => {
                    setCreating(true);
                    setSelectedId('');
                    setDraft(emptyDraft);
                    setNotice('');
                  }}>
                  <span className="admin-roles__role-icon" aria-hidden="true">＋</span>
                  <span className="admin-roles__role-copy"><strong>إنشاء دور مخصص</strong><small>حدد صلاحياته يدويًا</small></span>
                </button>
              )}
            </div>
          </div>

          {(selectedRole || creating) && (
            <form className="admin-roles__editor" onSubmit={saveRole}>
              <div className="admin-roles__editor-heading">
                <div>
                  <span className="dashboard-eyebrow">{creating ? 'دور جديد' : selectedRole.isSystemRole ? 'دور نظام' : 'دور مخصص'}</span>
                  <h3>{creating ? 'إعداد دور مخصص' : selectedRole.name}</h3>
                  <p>{creating ? 'اختر اسمًا واضحًا وحدد أقل مجموعة صلاحيات لازمة.' : selectedRole.description || roleDescriptions[selectedRole.key] || 'يمكنك مراجعة صلاحيات هذا الدور وإدارتها.'}</p>
                </div>
                <div className="admin-roles__summary" aria-live="polite">
                  <strong>{draft.permissions.length}</strong>
                  <span>من {permissions.length} صلاحية</span>
                </div>
              </div>

              {editable ? (
                <>
                  <div className="admin-roles__fields">
                    <label>اسم الدور
                      <input required minLength={2} maxLength={80} value={draft.name}
                        disabled={busy}
                        onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
                    </label>
                    <label>وصف مختصر
                      <textarea rows={2} maxLength={500} value={draft.description}
                        disabled={busy}
                        onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
                    </label>
                  </div>
                  {!creating && selectedRole && !selectedRole.isSystemRole && (
                    <label className="admin-roles__active-toggle">
                      <input type="checkbox" checked={draft.isActive} disabled={busy}
                        onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))} />
                      <span><strong>الدور نشط</strong><small>يمكن إسناد الأدوار المتوقفة فقط بعد إعادة تفعيلها.</small></span>
                    </label>
                  )}
                  <div className="admin-roles__permissions-heading">
                    <div><h4>الصلاحيات</h4><p>اختر ما يحتاجه هذا الدور فقط.</p></div>
                    <label className="admin-roles__search">
                      <span className="sr-only">البحث في الصلاحيات</span>
                      <input type="search" value={permissionSearch}
                        onChange={(event) => setPermissionSearch(event.target.value)}
                        placeholder="ابحث عن صلاحية…" />
                    </label>
                  </div>
                  <div className="admin-roles__groups">
                    {groupedPermissions.map((group) => {
                      const selectedCount = group.permissions.filter(({ key }) => draft.permissions.includes(key)).length;
                      return (
                        <section key={group.id} className="admin-roles__group">
                          <div className="admin-roles__group-heading">
                            <div><h5>{group.title}</h5><p>{group.description}</p></div>
                            <div className="admin-roles__group-actions">
                              <span>{selectedCount}/{group.permissions.length}</span>
                              <button type="button" disabled={busy}
                                onClick={() => toggleGroup(group.permissions, selectedCount !== group.permissions.length)}>
                                {selectedCount === group.permissions.length ? 'إلغاء الكل' : 'اختيار الكل'}
                              </button>
                            </div>
                          </div>
                          <div className="admin-roles__permission-grid">
                            {group.permissions.map((permission) => (
                              <label key={permission.key}
                                className={`admin-roles__permission${draft.permissions.includes(permission.key) ? ' is-selected' : ''}`}>
                                <input type="checkbox" checked={draft.permissions.includes(permission.key)}
                                  disabled={busy}
                                  onChange={() => togglePermission(permission.key)} />
                                <span><strong>{permissionLabels[permission.key] ?? permission.description}</strong>
                                  <small><bdi dir="ltr">{permission.key}</bdi></small></span>
                              </label>
                            ))}
                          </div>
                        </section>
                      );
                    })}
                    {!groupedPermissions.length && <p className="dashboard-empty-state">لا توجد صلاحيات تطابق البحث.</p>}
                  </div>
                  <div className="admin-roles__actions">
                    {creating && <button type="button" className="button button--outline" disabled={busy} onClick={resetDraft}>إلغاء</button>}
                    {!creating && dirty && <button type="button" className="button button--outline" disabled={busy} onClick={resetDraft}>تجاهل التعديلات</button>}
                    <button type="submit" className="button button--primary" disabled={busy || (!creating && !dirty)}>
                      {busy ? 'جارٍ الحفظ…' : creating ? 'إنشاء الدور' : 'حفظ التعديلات'}
                    </button>
                    {canManageRoles && !creating && selectedRole && !selectedRole.isSystemRole && (
                      <button type="button" className="button button--outline" disabled={busy} onClick={() => void deleteRole()}>
                        حذف الدور
                      </button>
                    )}
                  </div>
                  <p className="admin-roles__safety-note">لا يمكن لهذا الدور منح صلاحيات تتجاوز صلاحيات المسؤول الذي يديره.</p>
                </>
              ) : (
                <div className="admin-roles__readonly">
                  <span>هذا الدور محمي للمنصة ولا يمكن تغيير صلاحياته.</span>
                  <div className="admin-roles__permission-grid">
                    {permissions.filter(({ key }) => draft.permissions.includes(key)).map((permission) => (
                      <div key={permission.key} className="admin-roles__permission is-selected">
                        <span><strong>{permissionLabels[permission.key] ?? permission.description}</strong>
                          <small><bdi dir="ltr">{permission.key}</bdi></small></span>
                      </div>
                    ))}
                    {!draft.permissions.length && <span>لا توجد صلاحيات إدارية لهذا الدور.</span>}
                  </div>
                </div>
              )}
            </form>
          )}

          {canManageRoles && canViewUsers && <section className="admin-roles__assignments">
            <div className="admin-roles__editor-heading">
              <div><h3>مسؤولو المنصة</h3><p>إسناد دور إداري لمستخدم. يؤدي تغيير الدور إلى إنهاء جلساته الحالية.</p></div>
              <span className="admin-roles__summary"><strong>{administrators.length}</strong><span>مسؤول</span></span>
            </div>
            {administrators.map((administrator) => (
              <article className="admin-roles__administrator" key={administrator.id}>
                <div className="admin-roles__administrator-icon" aria-hidden="true">♜</div>
                <div className="admin-roles__administrator-info">
                  <strong><bdi dir="ltr">{administrator.email}</bdi></strong>
                  <small>{administrator.adminRole?.name ?? 'دور غير محدد'}</small>
                </div>
                <label>
                  <span className="sr-only">دور {administrator.email}</span>
                  <select value={roles.find((role) => role.key === administrator.adminRole?.key)?.id ?? ''}
                    disabled={busy || administrator.adminRole?.key === 'super-admin'}
                    onChange={(event) => void assignRole(administrator, event.target.value)}>
                    <option value="" disabled>اختر دورًا</option>
                    {roles.filter((role) => role.isActive && role.key !== 'super-admin')
                      .map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                  </select>
                </label>
              </article>
            ))}
          </section>}
        </>
      )}
    </section>
  );
}
