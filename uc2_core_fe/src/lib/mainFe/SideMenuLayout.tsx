import React, { useState, useMemo } from 'react';
import { InputText } from 'primereact/inputtext';

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  iconBgColor?: string;
  route?: string;
}

export interface MenuGroup {
  id: string;
  title: string;
  items: MenuItem[];
}

interface SideMenuLayoutProps {
  menuItems: MenuGroup[];
  activeRoute?: string;
  useNavLink?: boolean;
  onMenuItemClick?: (item: MenuItem) => void;
  maxVisibleItems?: number;
  showSearch?: boolean;
  searchPlaceholder?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  sidebarWidth?: number;
  testId?: string;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

export const SideMenuLayout: React.FC<SideMenuLayoutProps> = ({
  menuItems,
  activeRoute = '',
  onMenuItemClick,
  showSearch = true,
  searchPlaceholder = 'Search menu...',
  collapsible = true,
  defaultCollapsed = false,
  sidebarWidth = 240,
  testId,
  mobileOpen = false,
  onMobileOpenChange,
  children,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [searchText, setSearchText] = useState('');

  const filteredGroups = useMemo(() => {
    if (!searchText) return menuItems;
    const lower = searchText.toLowerCase();
    return menuItems
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.label.toLowerCase().includes(lower)),
      }))
      .filter((group) => group.items.length > 0);
  }, [menuItems, searchText]);

  const effectiveWidth = collapsed ? 60 : sidebarWidth;

  return (
    <div className="flex h-screen overflow-hidden" data-testid={testId}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => onMobileOpenChange?.(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700
          transition-all duration-300 flex flex-col
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{ width: effectiveWidth }}
      >
        {/* Header with collapse toggle */}
        <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
          {!collapsed && (
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Menu</span>
          )}
          {collapsible && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
            >
              <i className={`pi ${collapsed ? 'pi-angle-right' : 'pi-angle-left'}`} />
            </button>
          )}
        </div>

        {/* Search */}
        {showSearch && !collapsed && (
          <div className="p-2">
            <span className="p-input-icon-left w-full">
              <i className="pi pi-search text-xs" />
              <InputText
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full text-sm"
                style={{ paddingLeft: '2rem' }}
              />
            </span>
          </div>
        )}

        {/* Menu items */}
        <nav className="flex-1 overflow-y-auto py-2">
          {filteredGroups.map((group) => (
            <div key={group.id} className="mb-2">
              {group.title && !collapsed && (
                <p className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {group.title}
                </p>
              )}
              {group.items.map((item) => {
                const isActive = activeRoute === item.route;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onMenuItemClick?.(item);
                      onMobileOpenChange?.(false);
                    }}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors
                      ${isActive
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }
                    `}
                    title={collapsed ? item.label : undefined}
                  >
                    {item.icon && (
                      <span className={`w-7 h-7 rounded-md flex items-center justify-center text-white text-xs ${item.iconBgColor || 'bg-gray-500'}`}>
                        <i className={item.icon} />
                      </span>
                    )}
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
        {children}
      </main>
    </div>
  );
};

export default SideMenuLayout;
