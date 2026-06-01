require_relative './models'
require_relative './mixins'

class UserService
  def initialize
    @repo = UserRepo.new
  end

  def register(name, email)
    user = User.new(name, email)
    @repo.save(user)
    user
  end
end

class AdminService < UserService
  include Loggable

  def admin_register(name, email)
    log("Registering admin: #{name}")
    user = User.new(name, email)
    @repo.save(user)
    @repo.find(email)
  end
end
