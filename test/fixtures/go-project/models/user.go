package models

type User struct {
	ID    int
	Name  string
	Email string
}

type UserRepository interface {
	FindByID(id int) (*User, error)
	Save(user *User) error
}

func NewUser(name, email string) *User {
	return &User{Name: name, Email: email}
}
