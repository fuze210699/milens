import java.util.List;

public class UserService {
    private UserRepository repo = new UserRepository();

    public User register(String name, String email) {
        User user = new User(name, email);
        repo.save(user);
        return user;
    }
}
