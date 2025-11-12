import React from 'react';
import Layout from '../components/layout/Layout';

const Profile: React.FC = () => {
  return (
    <Layout>
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-4">Profile</h2>
        <div className="bg-white rounded-lg p-4 shadow-sm">Profile details and settings go here.</div>
      </div>
    </Layout>
  );
};

export default Profile;
