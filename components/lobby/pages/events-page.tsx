import { Calendar, MapPin, Users, Clock } from "lucide-react";

/**
 * EventsPage - Component for displaying upcoming events
 */
export const EventsPage = () => {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <Calendar className="w-12 h-12 text-orange-500 mr-3" />
            <h1 className="text-4xl font-bold text-white">Infernal Events</h1>
          </div>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Join the community in exciting Web3 events, workshops, and
            gatherings.
          </p>
        </div>

        {/* Coming Soon Message */}
        <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl p-8 border border-gray-700 text-center">
          <Calendar className="w-16 h-16 text-orange-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-4">
            Events Coming Soon
          </h2>
          <p className="text-gray-400 mb-6">
            We're preparing exciting community events, workshops, and networking
            opportunities for our Infernal community. Stay tuned for updates!
          </p>

          {/* Feature Preview */}
          <div className="grid md:grid-cols-3 gap-4 mt-8">
            <div className="bg-gray-800/50 rounded-lg p-4">
              <Users className="w-8 h-8 text-orange-500 mx-auto mb-2" />
              <h3 className="text-lg font-semibold text-white mb-2">
                Community Meetups
              </h3>
              <p className="text-sm text-gray-400">
                Connect with fellow Infernals in virtual and physical gatherings
              </p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <Clock className="w-8 h-8 text-orange-500 mx-auto mb-2" />
              <h3 className="text-lg font-semibold text-white mb-2">
                Workshops
              </h3>
              <p className="text-sm text-gray-400">
                Learn new Web3 skills through hands-on educational sessions
              </p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <MapPin className="w-8 h-8 text-orange-500 mx-auto mb-2" />
              <h3 className="text-lg font-semibold text-white mb-2">
                Conferences
              </h3>
              <p className="text-sm text-gray-400">
                Attend major Web3 conferences and represent the Infernal
                community
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
