/**
 * Header Component
 * Uses authentication from main_fe via Module Federation
 */

import { Button } from 'primereact/button';
import { Avatar } from 'primereact/avatar';
import { Menu } from 'primereact/menu';
import { MenuItem } from 'primereact/menuitem';
import { useRef, useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTheme } from '../../utils/theme';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { fileUploadService } from '../../services/file-upload.service';

// Import types for main_fe store
interface AuthState {
  user: any;
  tokens: any;
  isAuthenticated: boolean;
  loading: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: any;
}

interface RootState {
  auth: AuthState;
}

const Header = () => {
  const { mode, toggleTheme } = useTheme();
  const dispatch = useDispatch();
  const navigate = useAppNavigate();
  const { user } = useSelector((state: RootState) => state.auth);
  const menuRef = useRef<Menu>(null);
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);

  // Fetch profile picture when user data is loaded
  useEffect(() => {
    let blobUrl: string | null = null;

    if (user?.picture) {
      fileUploadService.getFileUrl(user.picture)
        .then((url) => {
          blobUrl = url;
          setProfilePictureUrl(url);
        })
        .catch((err) => {
          console.error('Failed to fetch profile picture:', err);
          setProfilePictureUrl(null);
        });
    } else {
      setProfilePictureUrl(null);
    }

    // Cleanup blob URL
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [user?.picture]);

  const handleLogout = () => {
    // Import and dispatch logout from main_fe
    import('mainFe/store').then((module) => {
      const { logout } = module;
      if (logout) {
        dispatch(logout() as any);
        navigate('/login');
      }
    });
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    if (!firstName && !lastName) return 'U';
    return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase();
  };

  const profileMenuItems: MenuItem[] = [
    {
      template: () => (
        <div className="px-4 py-3 min-w-[220px] flex items-center gap-3">
          {profilePictureUrl ? (
            <img
              src={profilePictureUrl}
              alt={`${user?.firstName} ${user?.lastName}`}
              className="w-12 h-12 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center text-white font-semibold text-lg">
              {getInitials(user?.firstName, user?.lastName)}
            </div>
          )}
          <div>
            <div className="font-semibold text-base">
              {user?.firstName} {user?.lastName}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {user?.email}
            </div>
          </div>
        </div>
      ),
    },
    {
      label: 'Logout',
      icon: 'pi pi-sign-out',
      command: handleLogout,
      template: (item) => (
        <div
          onClick={item.command}
          className="flex items-center px-4 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-lg"
          data-testid="Header.MenuItem.Logout"
        >
          <i className="pi pi-sign-out mr-2" style={{ fontSize: '1.5rem' }} />
          <span>Logout</span>
        </div>
      ),
    },
  ];

  return (
    <header className="sticky top-0 z-50 shadow-lg bg-blue-600 dark:bg-blue-800 text-white transition-colors duration-200" data-testid="Header">
      <div className="flex items-center justify-between px-6 py-3.5">
        {/* Logo and Title */}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-white tracking-tight">
            Police Management System
          </h1>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-3">
          {/* Home Button */}
          <Button
            text
            onClick={() => navigate('/dashboard')}
            className="p-button-text text-white hover:bg-blue-700 dark:hover:bg-blue-900 transition-colors"
            data-testid="Header.Button.Home"
            style={{ fontSize: '1.125rem', padding: '0.75rem 1rem' }}
          >
            <i className="pi pi-home mr-2" style={{ fontSize: '1.375rem' }} />
            <span>Home</span>
          </Button>

          {/* Admin Logs Button */}
          <Button
            text
            onClick={() => navigate('/logs')}
            disabled
            className="p-button-text text-white opacity-50 cursor-not-allowed"
            data-testid="Header.Button.Logs"
            style={{ fontSize: '1.125rem', padding: '0.75rem 1rem' }}
          >
            <i className="pi pi-file mr-2" style={{ fontSize: '1.375rem' }} />
            <span>Admin Logs</span>
          </Button>

          {/* Theme Toggle */}
          <Button
            text
            rounded
            onClick={toggleTheme}
            className="p-button-text p-button-rounded text-white hover:bg-blue-700 dark:hover:bg-blue-900 transition-colors"
            aria-label="toggle theme"
            data-testid="Header.Button.ThemeToggle"
            style={{ width: '2.75rem', height: '2.75rem' }}
          >
            {mode === 'light' ? <i className="pi pi-moon" style={{ fontSize: '1.25rem' }} /> : <i className="pi pi-sun" style={{ fontSize: '1.25rem' }} />}
          </Button>

          {/* Profile Menu */}
          <Button
            text
            rounded
            onClick={(e) => menuRef.current?.toggle(e)}
            className="p-button-text p-button-rounded p-0 hover:bg-blue-700 dark:hover:bg-blue-900 transition-colors"
            data-testid="Header.Button.Profile"
          >
            {profilePictureUrl ? (
              <img
                src={profilePictureUrl}
                alt={`${user?.firstName} ${user?.lastName}`}
                className="rounded-full object-cover"
                style={{
                  width: '40px',
                  height: '40px',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                }}
              />
            ) : (
              <Avatar
                label={getInitials(user?.firstName, user?.lastName)}
                shape="circle"
                size="large"
                style={{
                  width: '40px',
                  height: '40px',
                  fontSize: '1rem',
                  backgroundColor: '#ef4444',
                  fontWeight: '600'
                }}
              />
            )}
          </Button>

          <Menu
            model={profileMenuItems}
            popup
            ref={menuRef}
            className="shadow-lg"
          />
        </div>
      </div>
    </header>
  );
};

export default Header;
