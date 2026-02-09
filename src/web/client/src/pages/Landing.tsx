import { Link } from 'react-router-dom';

// Feature data
const features = [
  {
    title: 'SMART CONVERSATIONS',
    description: 'AI-powered chat with context awareness. Hive remembers your preferences, learns your patterns, and provides personalized assistance.',
    screenshot: '/screenshots/chat.png',
    placeholder: 'Chat Interface',
  },
  {
    title: 'WORKFLOW AUTOMATION',
    description: 'Build multi-step automations visually. Create custom workflows that trigger on schedules or events to automate your daily tasks.',
    screenshot: '/screenshots/workflows.png',
    placeholder: 'Workflow Builder',
  },
  {
    title: 'MULTI-CHANNEL',
    description: 'Connect via Telegram, WhatsApp, or the web dashboard. Your assistant is always available wherever you prefer to communicate.',
    screenshot: '/screenshots/telegram.png',
    placeholder: 'Telegram Chat',
  },
  {
    title: 'INTEGRATIONS',
    description: 'Connect your favorite tools. Google Calendar, Gmail, and more integrations to make Hive work seamlessly with your existing setup.',
    screenshot: '/screenshots/integrations.png',
    placeholder: 'Integrations Page',
  },
];

function FeatureSection({
  title,
  description,
  screenshot,
  placeholder,
  reverse,
}: {
  title: string;
  description: string;
  screenshot: string;
  placeholder: string;
  reverse?: boolean;
}) {
  return (
    <div className={`flex flex-col ${reverse ? 'md:flex-row-reverse' : 'md:flex-row'} items-center gap-8 md:gap-12`}>
      {/* Screenshot */}
      <div className="flex-1 w-full">
        <div className="relative">
          {/* Retro frame */}
          <div className="absolute -inset-2 bg-gradient-to-br from-c64-blue/20 to-c64-purple/20 rounded-lg blur-sm" />
          <div className="relative bg-gray-900 rounded-lg border-2 border-c64-blue/30 p-2 shadow-[0_0_30px_rgba(64,64,224,0.15)]">
            <img
              src={screenshot}
              alt={placeholder}
              className="w-full rounded"
              onError={(e) => {
                // Hide broken image and show placeholder
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const placeholderEl = target.nextElementSibling;
                if (placeholderEl) {
                  placeholderEl.classList.remove('hidden');
                }
              }}
            />
            <div className="hidden aspect-video bg-gray-800 rounded flex items-center justify-center">
              <span className="text-gray-500 font-pixel text-xs">{placeholder}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 text-center md:text-left">
        <h3 className="font-pixel text-lg md:text-xl text-hive-500 mb-4">{title}</h3>
        <p className="text-gray-300 text-lg leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Scanline overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)',
        }}
      />

      {/* Header */}
      <header className="relative z-10 border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/hive.png" alt="Hive" className="w-10 h-10" />
            <span className="font-pixel text-sm text-white">HIVE</span>
          </div>
          <Link
            to="/login"
            className="px-4 py-2 bg-hive-500 hover:bg-hive-600 text-black font-medium rounded-lg transition-colors text-sm"
          >
            Get Started →
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 text-center">
          {/* Large Logo with glow */}
          <div className="mb-8">
            <img
              src="/hive.png"
              alt="Hive"
              className="w-48 h-48 md:w-64 md:h-64 mx-auto drop-shadow-[0_0_60px_rgba(64,64,224,0.6)] drop-shadow-[0_0_120px_rgba(64,64,224,0.3)]"
            />
          </div>

          {/* Tagline */}
          <h1 className="font-pixel text-2xl md:text-3xl text-white mb-4 leading-relaxed">
            YOUR PERSONAL
            <br />
            <span className="text-hive-500">AI ASSISTANT HUB</span>
          </h1>

          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mb-8">
            A smart, cost-efficient AI assistant that learns your preferences,
            automates your workflows, and connects to all your favorite tools.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/login"
              className="px-8 py-3 bg-hive-500 hover:bg-hive-600 text-black font-semibold rounded-lg transition-colors text-lg shadow-[0_0_20px_rgba(234,179,8,0.3)]"
            >
              Get Started
            </Link>
            <a
              href="#features"
              className="px-8 py-3 border border-c64-blue/50 hover:border-c64-blue hover:bg-c64-blue/10 text-white font-medium rounded-lg transition-colors text-lg"
            >
              Learn More
            </a>
          </div>
        </div>
      </section>

      {/* Pixel divider */}
      <div className="relative z-10 flex justify-center py-4">
        <div className="flex gap-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-2 h-2 bg-c64-blue/50" />
          ))}
        </div>
      </div>

      {/* Features Section */}
      <section id="features" className="relative z-10 py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="font-pixel text-xl md:text-2xl text-white text-center mb-16">
            FEATURES
          </h2>

          <div className="space-y-20 md:space-y-32">
            {features.map((feature, index) => (
              <FeatureSection
                key={feature.title}
                {...feature}
                reverse={index % 2 === 1}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Pixel divider */}
      <div className="relative z-10 flex justify-center py-4">
        <div className="flex gap-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-2 h-2 bg-c64-purple/50" />
          ))}
        </div>
      </div>

      {/* Why Hive Section */}
      <section className="relative z-10 py-16 md:py-24 bg-gray-900/30">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="font-pixel text-xl md:text-2xl text-white mb-8">
            WHY <span className="text-hive-500">HIVE</span>?
          </h2>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div className="p-6 border border-c64-blue/20 rounded-lg bg-black/50">
              <div className="text-3xl mb-4">💰</div>
              <h3 className="font-pixel text-sm text-hive-500 mb-2">COST EFFICIENT</h3>
              <p className="text-gray-400 text-sm">
                Smart context management means 70-90% lower costs than alternatives.
              </p>
            </div>

            <div className="p-6 border border-c64-blue/20 rounded-lg bg-black/50">
              <div className="text-3xl mb-4">🔒</div>
              <h3 className="font-pixel text-sm text-hive-500 mb-2">SELF HOSTED</h3>
              <p className="text-gray-400 text-sm">
                Run on your own server. Your data stays yours.
              </p>
            </div>

            <div className="p-6 border border-c64-blue/20 rounded-lg bg-black/50">
              <div className="text-3xl mb-4">⚡</div>
              <h3 className="font-pixel text-sm text-hive-500 mb-2">EXTENSIBLE</h3>
              <p className="text-gray-400 text-sm">
                Add custom skills, integrations, and workflows to fit your needs.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pixel divider */}
      <div className="relative z-10 flex justify-center py-4">
        <div className="flex gap-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-2 h-2 bg-c64-blue/50" />
          ))}
        </div>
      </div>

      {/* Smart Orchestration Section */}
      <section className="relative z-10 py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">
            {/* Diagram placeholder */}
            <div className="flex-1 w-full">
              <div className="relative">
                <div className="absolute -inset-2 bg-gradient-to-br from-c64-purple/20 to-c64-blue/20 rounded-lg blur-sm" />
                <div className="relative bg-gray-900 rounded-lg border-2 border-c64-purple/30 p-4 shadow-[0_0_30px_rgba(128,64,224,0.15)]">
                  <img
                    src="/screenshots/orchestration.png"
                    alt="Smart Orchestration"
                    className="w-full rounded"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const placeholderEl = target.nextElementSibling;
                      if (placeholderEl) {
                        placeholderEl.classList.remove('hidden');
                      }
                    }}
                  />
                  <div className="hidden aspect-video bg-gray-800 rounded flex items-center justify-center">
                    <span className="text-gray-500 font-pixel text-xs">Orchestration Diagram</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 text-center md:text-left">
              <h2 className="font-pixel text-xl md:text-2xl text-white mb-4">
                SMART <span className="text-c64-purple">ORCHESTRATION</span>
              </h2>
              <p className="text-gray-300 text-lg leading-relaxed mb-6">
                Hive's intelligent orchestration layer analyzes each message and routes it to the optimal AI model.
                A lightweight model classifies intent first, dramatically reducing costs while maintaining quality.
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-c64-cyan">▸</span>
                  <p className="text-gray-400"><strong className="text-white">Choose Your AI:</strong> Use Claude, OpenAI, or run completely local with Ollama - your choice</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-c64-cyan">▸</span>
                  <p className="text-gray-400"><strong className="text-white">Hybrid Mode:</strong> Try local first, fall back to cloud when needed</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-c64-cyan">▸</span>
                  <p className="text-gray-400"><strong className="text-white">Context Aware:</strong> Only sends relevant context, not your entire history</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pixel divider */}
      <div className="relative z-10 flex justify-center py-4">
        <div className="flex gap-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-2 h-2 bg-hive-500/50" />
          ))}
        </div>
      </div>

      {/* Multi-User & Community Section */}
      <section className="relative z-10 py-16 md:py-24 bg-gray-900/30">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex flex-col md:flex-row-reverse items-center gap-8 md:gap-12">
            {/* Visual */}
            <div className="flex-1 w-full">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border border-c64-blue/30 rounded-lg bg-black/50 text-center">
                  <div className="text-4xl mb-2">👥</div>
                  <p className="font-pixel text-xs text-hive-500">MULTI-USER</p>
                </div>
                <div className="p-4 border border-c64-purple/30 rounded-lg bg-black/50 text-center">
                  <div className="text-4xl mb-2">🔄</div>
                  <p className="font-pixel text-xs text-c64-cyan">SHARE</p>
                </div>
                <div className="p-4 border border-hive-500/30 rounded-lg bg-black/50 text-center">
                  <div className="text-4xl mb-2">📋</div>
                  <p className="font-pixel text-xs text-c64-purple">TEMPLATES</p>
                </div>
                <div className="p-4 border border-c64-cyan/30 rounded-lg bg-black/50 text-center">
                  <div className="text-4xl mb-2">🚀</div>
                  <p className="font-pixel text-xs text-hive-500">GROW</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 text-center md:text-left">
              <h2 className="font-pixel text-xl md:text-2xl text-white mb-4">
                TEAM <span className="text-hive-500">COLLABORATION</span>
              </h2>
              <p className="text-gray-300 text-lg leading-relaxed mb-6">
                Hive is built for teams. Multiple users can share a single server, each with their own
                conversations, preferences, and private data - while collaborating on shared resources.
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-hive-500">▸</span>
                  <p className="text-gray-400"><strong className="text-white">Share Workflows:</strong> Create automations and share them with your team instantly</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-hive-500">▸</span>
                  <p className="text-gray-400"><strong className="text-white">Build Together:</strong> Fork and improve workflows from others - everyone benefits</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-hive-500">▸</span>
                  <p className="text-gray-400"><strong className="text-white">Private by Default:</strong> Your conversations stay yours, share only what you choose</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="font-pixel text-xl md:text-2xl text-white mb-4">
            READY TO GET STARTED?
          </h2>
          <p className="text-gray-400 text-lg mb-8">
            Join the hive and take control of your AI assistant.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/login"
              className="px-8 py-3 bg-hive-500 hover:bg-hive-600 text-black font-semibold rounded-lg transition-colors text-lg shadow-[0_0_20px_rgba(234,179,8,0.3)]"
            >
              Create Account
            </Link>
            <Link
              to="/login"
              className="px-8 py-3 border border-gray-600 hover:border-gray-500 hover:bg-gray-800/50 text-white font-medium rounded-lg transition-colors text-lg"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gray-800 py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/hive.png" alt="Hive" className="w-6 h-6" />
            <span className="text-gray-500 text-sm">© {new Date().getFullYear()} Hive</span>
          </div>

          <div className="flex gap-6 text-sm text-gray-500">
            <a
              href="https://github.com/marcemmerson/hive-assistant"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-300 transition-colors"
            >
              GitHub
            </a>
            <a href="#features" className="hover:text-gray-300 transition-colors">
              Features
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
