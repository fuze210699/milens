class User
  attr_reader :name, :email

  def initialize(name, email)
    @name = name
    @email = email
  end
end

class UserRepo
  def initialize
    @users = []
  end

  def save(user)
    @users << user
  end

  def find(email)
    @users.find { |u| u.email == email }
  end
end
