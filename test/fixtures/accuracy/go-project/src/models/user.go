package models

type User struct {
	Name  string
	Email string
}

type UserRepo struct {
	users []User
}

func (r *UserRepo) Save(user User) {
	r.users = append(r.users, user)
}

func (r *UserRepo) Find(email string) *User {
	for i := range r.users {
		if r.users[i].Email == email {
			return &r.users[i]
		}
	}
	return nil
}
