#!/bin/bash
set -e
mkdir -p "$(dirname 'Gemfile')"
cat > 'Gemfile' <<'__EOF__'
source 'https://rubygems.org'
gem 'rails', '~> 7.2'
gem 'sidekiq', '~> 7.3'
__EOF__
mkdir -p "$(dirname 'config/application.rb')"
cat > 'config/application.rb' <<'__EOF__'
module App; class Application < Rails::Application; end; end
__EOF__
mkdir -p "$(dirname 'app/models/user.rb')"
cat > 'app/models/user.rb' <<'__EOF__'
class User < ApplicationRecord; end
__EOF__
