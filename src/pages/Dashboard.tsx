import React from 'react';
import Layout from '../components/layout/Layout';
import { FileText, BarChart2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface MetricCardProps {
  label: string;
  value: string;
  subtext: string;
  accentColor: 'yellow' | 'green' | 'blue' | 'purple' | 'rose';
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, subtext, accentColor }) => {
  const borderColor = {
    yellow: 'border-yellow-500',
    green: 'border-green-500',
    blue: 'border-blue-500',
    purple: 'border-purple-500',
    rose: 'border-rose-500'
  }[accentColor] || 'border-gray-500';

  const textColor = {
    yellow: 'text-yellow-600',
    green: 'text-green-600',
    blue: 'text-blue-600',
    purple: 'text-purple-600',
    rose: 'text-rose-600'
  }[accentColor] || 'text-gray-600';

  return (
    <div className={`bg-white rounded-lg p-4 border-l-4 ${borderColor} shadow-sm`}>
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">{label}</div>
        <div className={`text-xl font-semibold ${textColor}`}>{value}</div>
      </div>
      <div className={`text-xs ${textColor} mt-1`}>{subtext}</div>
    </div>
  );
};

const stats: MetricCardProps[] = [
  { label: 'Total Quotations', value: '248', subtext: '+18.7% increase from last month', accentColor: 'yellow' },
  { label: 'Active Quotations', value: '187', subtext: '75.4% success rate', accentColor: 'green' },
  { label: 'Pending Review', value: '45', subtext: '12 require immediate attention', accentColor: 'purple' },
  { label: 'Average Value', value: '₹12,500', subtext: '15.3% increase from last month', accentColor: 'blue' },
] as const;

const secondaryStats: MetricCardProps[] = [
  { label: 'Pending Approval', value: '1', subtext: 'Awaiting review', accentColor: 'yellow' },
  { label: 'Approved Today', value: '0', subtext: 'Ready to send', accentColor: 'green' },
  { label: 'This Week', value: '1', subtext: 'Weekly total', accentColor: 'blue' },
  { label: 'Conversion Rate', value: '0%', subtext: '+8% improvement', accentColor: 'purple' },
] as const;



const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  return (
    <Layout>
      <div className="space-y-6 p-6">
        {/* Welcome Header */}
        <div className="rounded-2xl bg-gradient-to-r from-rose-500 via-fuchsia-500 to-indigo-600 p-8">
          <h1 className="text-2xl font-semibold text-white mb-2">Welcome to Prayosha Automation</h1>
          <p className="text-white/90">Professional Quotation Management System</p>
          <div className="text-sm mt-4 text-white/80">
            Manage your quotations efficiently and professionally
          </div>
          <div className="text-sm mt-2 text-white/80">Today is Friday, November 7, 2025</div>
        </div>

        {/* Primary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat) => (
            <MetricCard key={stat.label} {...stat} />
          ))}
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {secondaryStats.map((stat) => (
            <MetricCard key={stat.label} {...stat} />
          ))}
        </div>

        {/* Call to Action */}
        <div className="rounded-2xl bg-gradient-to-r from-rose-500 to-rose-400 p-8 text-white">
          <h2 className="text-xl font-semibold mb-2">See the System in Action</h2>
          <p className="text-white/90 mb-4">Preview a sample quotation with professional formatting and layout</p>
          <button className="bg-white text-rose-500 px-4 py-2 rounded-lg hover:bg-white/90 inline-flex items-center gap-2">
            View Sample Quotation →
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Quick Actions */}
          <div className="lg:col-span-1">
            <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
              <div className="space-y-2">
              <button onClick={() => { navigate('/quotations'); }} className="w-full py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg flex items-center justify-center gap-2 text-base font-medium">
                <FileText size={20} />
                New Quotation
              </button>
              <button onClick={() => { navigate('/reports'); }} className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg flex items-center justify-center gap-2 text-base font-medium">
                <BarChart2 size={20} />
                View Reports
              </button>
            </div>
          </div>

          {/* Recent Quotations */}
          <div className="lg:col-span-3">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Recent Quotations</h3>
              <a href="#" className="text-rose-500 hover:text-rose-600 text-sm">View All</a>
            </div>
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <table className="min-w-full">
                <thead className="bg-[#1a237e] text-white">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Quote ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm">PAQ-00001</td>
                    <td className="px-6 py-4 text-sm">Zydus Pharmaceuticals</td>
                    <td className="px-6 py-4 text-sm text-right">₹88,500</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">Pending</span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-1">
                      <button className="text-gray-700 hover:text-gray-900 px-2">View</button>
                      <button className="text-gray-700 hover:text-gray-900 px-2">Edit</button>
                      <button className="text-gray-700 hover:text-gray-900 px-2">PDF</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Help Section */}
        <div className="bg-rose-100 rounded-lg p-4">
          <h3 className="text-rose-700 font-semibold mb-1">Need Help?</h3>
          <p className="text-rose-600 text-sm">Contact support for assistance</p>
        </div>

      </div>
    </Layout>
  );
};

export default Dashboard;