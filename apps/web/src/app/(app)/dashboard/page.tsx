'use client';

import { useAuth } from '@/hooks/useAuth';

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>
      
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Welcome back, {user?.name}! 👋</h1>
        <p className="text-gray-600 mb-4">
          This is your DevOps Platform dashboard. More features coming soon in the next sprints.
        </p>
      </div>

      {/* Placeholder Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-600 text-sm font-medium mb-2">Projects</h3>
          <p className="text-3xl font-bold text-gray-900">-</p>
          <p className="text-xs text-gray-500 mt-2">Coming in Sprint 3</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-600 text-sm font-medium mb-2">Servers</h3>
          <p className="text-3xl font-bold text-gray-900">-</p>
          <p className="text-xs text-gray-500 mt-2">Coming in Sprint 4</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-600 text-sm font-medium mb-2">Recent Deployments</h3>
          <p className="text-3xl font-bold text-gray-900">-</p>
          <p className="text-xs text-gray-500 mt-2">Coming in Sprint 4</p>
        </div>
      </div>

      {/* Sprint Progress */}
      <div className="bg-white rounded-lg shadow p-6 mt-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">📋 Frontend Sprints Progress</h2>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-900">Sprint 1: Authentication</span>
              <span className="text-sm text-green-600 font-semibold">✅ Active</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-green-600 h-2 rounded-full" style={{ width: '100%' }}></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-900">Sprint 2: Dashboard</span>
              <span className="text-sm text-gray-500">Coming Soon</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-gray-400 h-2 rounded-full" style={{ width: '0%' }}></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-900">Sprint 3: Projects</span>
              <span className="text-sm text-gray-500">Coming Soon</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-gray-400 h-2 rounded-full" style={{ width: '0%' }}></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-900">Sprint 4: Deployments</span>
              <span className="text-sm text-gray-500">Coming Soon</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-gray-400 h-2 rounded-full" style={{ width: '0%' }}></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-900">Sprint 5: WebSocket Logs</span>
              <span className="text-sm text-gray-500">Coming Soon</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-gray-400 h-2 rounded-full" style={{ width: '0%' }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
