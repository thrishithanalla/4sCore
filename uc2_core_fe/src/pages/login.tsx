import { Message } from 'mainFe/Message';
import { Card } from 'mainFe/Card';
import { Input } from 'mainFe/Input';
import { Password } from 'mainFe/Password';
import { Button } from 'mainFe/Button';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearError, login } from '../features/auth/authSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

const Login = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [mpin, setMpin] = useState('');

  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { loading, error, isAuthenticated } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    return () => {
      dispatch(clearError());
    };
  }, [dispatch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(login({ phoneNumber, mpin: Number(mpin) }));
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800"
      data-testid="SCR-Auth-Login"
    >
      <div className="w-full max-w-md">
        <Card className="shadow-xl">
          <div className="p-8">
            <div className="flex flex-col items-center mb-3">
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mb-3">
                <i className="pi pi-sign-in text-white" style={{ fontSize: '2rem' }} />
              </div>
              <h1 className="text-xl font-bold text-center text-gray-900 dark:text-white">
                CORE SERVICE
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-center mt-2">
                Sign in to access your account
              </p>
            </div>

            {error && (
              <Message
                severity="error"
                text={error}
                className="mb-4 w-full"
              />
            )}

            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <Input
                  id="phoneNumber"
                  name="phoneNumber"
                  placeholder="Phone Number"
                  value={phoneNumber}
                  onChange={(e: any) => setPhoneNumber(typeof e === 'string' ? e : e.target.value)}
                  required
                  autoFocus
                  style={{ width: '100%' }}
                  testId="Login.Input.PhoneNumber"
                />
              </div>

              <div className="mb-3">
                <Password
                  id="mpin"
                  name="mpin"
                  placeholder="MPIN"
                  value={mpin}
                  onChange={(e: any) => setMpin(typeof e === 'string' ? e : e.target.value)}
                  required
                  feedback={false}
                  toggleMask
                  style={{ width: '100%' }}
                  data-testid="Login.Input.Mpin"
                />
              </div>

              <Button
                type="submit"
                label={loading ? 'Signing in...' : 'Sign In'}
                icon={loading ? 'pi pi-spin pi-spinner' : undefined}
                disabled={loading}
                className="w-full"
                data-testid="Login.Button.Submit"
              />
            </form>

            <div className="mt-4 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Use your credentials to login
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Login;
