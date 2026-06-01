public class User {
    private String name;
    private String email;

    public User(String name, String email) {
        this.name = name;
        this.email = email;
    }

    public String getName() { return name; }
    public String getEmail() { return email; }
}

public interface Repository<T> {
    void save(T item);
}

public class UserRepository implements Repository<User> {
    private java.util.List<User> users = new java.util.ArrayList<>();

    public void save(User user) {
        users.add(user);
    }

    public User findByEmail(String email) {
        for (User u : users) {
            if (u.getEmail().equals(email)) return u;
        }
        return null;
    }
}
