'use client';

import { useAuth } from '@/hooks/useAuth';

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Profile</h1>

      <div className="bg-white rounded-lg shadow p-6 max-w-md">
        <div className="mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-4">
            {user?.name.charAt(0).toUpperCase()}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-500 font-medium">Name</p>
            <p className="text-lg font-semibold text-gray-900">{user?.name}</p>
          </div>

          <div>
            <p className="text-sm text-gray-500 font-medium">Email</p>
            <p className="text-lg font-semibold text-gray-900">{user?.email}</p>
          </div>

          <div>
            <p className="text-sm text-gray-500 font-medium">Role</p>
            <p className="text-lg font-semibold text-gray-900">
              {user?.role === 'ADMIN' ? '👑 Administrator' : '👨‍💻 Developer'}
            </p>
          </div>
        </div>

        <button className="mt-6 w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded-lg font-medium transition disabled:opacity-50">
          Edit Profile (Coming Soon)
        </button>
      </div>
    </div>
  );
}
